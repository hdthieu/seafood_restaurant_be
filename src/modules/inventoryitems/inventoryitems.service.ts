// inventoryitems.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { InventoryItem } from './entities/inventoryitem.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { Category } from '@modules/category/entities/category.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items.query.dto';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { ListIngredientsDto } from './dto/list-ingredients.dto';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';


@Injectable()
export class InventoryitemsService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,

    @InjectRepository(UomConversion)
    private readonly convRepo: Repository<UomConversion>,

    @InjectRepository(UnitsOfMeasure)
    private readonly uomRepo: Repository<UnitsOfMeasure>,
  ) { }

  /** Tạo mới vật tư (nguyên liệu) trong kho */
  async create(dto: CreateInventoryitemDto): Promise<ResponseCommon<any>> {
    try {
      const name = (dto.name || '').trim();
      const uomCode = (dto.unit || '').trim().toUpperCase();
      if (!name) throw new BadRequestException('NAME_REQUIRED');
      if (!uomCode) throw new BadRequestException('UOM_REQUIRED');

      const baseUom = await this.uomRepo.findOne({ where: { code: uomCode } });
      if (!baseUom) throw new BadRequestException('UOM_NOT_FOUND');

      const quantity = Number(dto.quantity ?? 0);
      const alertThreshold = Number(dto.alertThreshold ?? 0);
      if (quantity < 0) throw new BadRequestException('QUANTITY_INVALID');
      if (alertThreshold < 0) throw new BadRequestException('ALERT_THRESHOLD_INVALID');

      // Tạo code đơn giản: ING-yyyymmdd-hhmmss-xxx
      const now = new Date();
      const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
      const code = `ING-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.floor(Math.random() * 900 + 100)}`;

      const item = this.inventoryRepo.create({
        name,
        code,
        baseUom: baseUom,
        quantity,
        alertThreshold,
        description: dto.description?.trim() || null,
        // avgCost mặc định = 0, suppliers & category chưa thiết lập ở bước tạo này
      });
      const saved = await this.inventoryRepo.save(item);

      return new ResponseCommon(201, true, 'Tạo vật tư thành công', {
        id: saved.id,
        code: saved.code,
        name: saved.name,
        baseUom: { code: baseUom.code, name: baseUom.name, dimension: baseUom.dimension },
        quantity: Number(saved.quantity),
        alertThreshold: Number(saved.alertThreshold),
        avgCost: Number(saved.avgCost ?? 0),
        description: saved.description,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      throw new ResponseException(error, 400, 'Không thể tạo vật tư mới');
    }
  }


  /** Danh sách tất cả item kèm baseUom/category/suppliers (đủ để FE hiển thị combobox đẹp) */
  async findAll(dto: ListIngredientsDto): Promise<ResponseCommon<any[], PageMeta>> {
    try {
      const page = Math.max(1, dto.page ?? 1);
      const limit = Math.max(1, Math.min(100, dto.limit ?? 10));
      const skip = (page - 1) * limit;

      const qb = this.inventoryRepo.createQueryBuilder('i')
        .leftJoinAndSelect('i.baseUom', 'u')
        .leftJoinAndSelect('i.category', 'c')
        .leftJoinAndSelect('i.suppliers', 's')
        .orderBy('i.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .distinct(true);

      qb.select(['i', 'u', 'c', 's.id', 's.name']).distinct(true);

      // --- Search theo tên + đơn vị
      const q = dto.q?.trim();
      if (q) {
        const kw = `%${q.toLowerCase()}%`;
        qb.andWhere('(LOWER(i.name) LIKE :kw OR LOWER(u.name) LIKE :kw OR LOWER(u.code) LIKE :kw)', { kw });
      }

      // --- Lọc theo đơn vị
      if (dto.baseUomCode?.trim()) {
        qb.andWhere('u.code = :uom', { uom: dto.baseUomCode.trim().toUpperCase() });
      }

      // --- Lọc theo tồn kho
      switch (dto.stock) {
        case 'BELOW': qb.andWhere('i.quantity < i.alertThreshold'); break;
        case 'OVER': qb.andWhere('i.quantity > i.alertThreshold'); break;
        case 'IN_STOCK': qb.andWhere('i.quantity > 0'); break;
        case 'OUT_OF_STOCK': qb.andWhere('i.quantity = 0'); break;
      }

      // --- Lọc theo nhà cung cấp
      if (dto.supplierId) {
        qb.andWhere('s.id = :sid', { sid: dto.supplierId });
      }

      // Đếm tổng (vì DISTINCT)
      const countQb = qb.clone()
        .select('COUNT(DISTINCT i.id)', 'cnt')
        .limit(undefined)
        .offset(undefined)
        .orderBy(undefined as any);
      const [{ cnt }] = await countQb.getRawMany();
      const total = Number(cnt ?? 0);

      const rows = await qb.getMany();

      const items = rows.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        baseUom: {
          code: r.baseUom.code,
          name: r.baseUom.name,
          dimension: r.baseUom.dimension,
        },
        quantity: Number(r.quantity),
        avgCost: Number(r.avgCost),
        alertThreshold: Number(r.alertThreshold),
        category: r.category ? { id: r.category.id, name: r.category.name } : null,
        suppliers: (r.suppliers ?? []).map(s => ({ id: s.id, name: s.name })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách vật tư thành công',
        items,
        { total, page, limit, pages: Math.ceil(total / limit) || 0 },
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'Không thể lấy danh sách vật tư');
    }
  }



  /** (tuỳ chọn) lấy chi tiết 1 item */
  async findOne(id: string) {
    const r = await this.inventoryRepo.findOne({
      where: { id },
      relations: ['baseUom', 'category', 'suppliers'],
    });
    if (!r) throw new NotFoundException('ITEM_NOT_FOUND');
    return r;
  }

  async listItems(query: ListInventoryItemsQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));

    const where: any = {};
    if (query.categoryId) where.category = { id: query.categoryId };

    const [rows, total] = await this.inventoryRepo.findAndCount({
      where,
      relations: ['baseUom', 'category'],
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        baseUom: r.baseUom ? { code: r.baseUom.code, name: r.baseUom.name } : null,
        category: r.category ? { id: r.category.id, name: r.category.name } : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUomsForItem(itemId: string): Promise<Array<{
    code: string; name: string; conversionToBase: number; isBase: boolean; label: string;
  }>> {
    const item = await this.inventoryRepo.findOne({
      where: { id: itemId },
      relations: ['baseUom'],
    });
    if (!item) throw new NotFoundException('ITEM_NOT_FOUND');

    const base = item.baseUom; // ví dụ: CAN

    // lấy các conversion có đích là base: 1 from = factor * base
    const conversions = await this.convRepo.find({
      where: { to: { code: base.code } },
      relations: ['from', 'to'],
      order: { factor: 'ASC' },
    });

    const baseOption = {
      code: base.code,
      name: base.name,
      conversionToBase: 1,
      isBase: true,
      label: `${base.code} (base)`,
    };

    const others = conversions
      .filter(c => c.from.code !== base.code)
      .filter(c => c.from.dimension === base.dimension) // chặn ml/l/kg...
      .map(c => ({
        code: c.from.code,
        name: c.from.name,
        conversionToBase: Number(c.factor),
        isBase: false,
        label: `${c.from.code} (x${Number(c.factor)} ${base.code})`,
      }))
      .sort((a, b) => a.conversionToBase - b.conversionToBase);

    return [baseOption, ...others];
  }
}
