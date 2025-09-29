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

// // Gợi ý DTO (bạn có thể điều chỉnh tên/đường dẫn theo dự án của bạn)
// export class CreateInventoryitemDto {
//   name: string;
//   baseUomCode: string;         // 'KG' | 'CAN' | ...
//   code?: string;               // optional, nếu không gửi sẽ tự tạo
//   categoryId?: string;         // optional
//   supplierIds?: string[];      // optional
//   alertThreshold?: number;     // optional
//   description?: string | null; // optional
// }

@Injectable()
export class InventoryitemsService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,

    @InjectRepository(UomConversion)
    private readonly convRepo: Repository<UomConversion>,
  ) { }

  private genCode(prefix = 'ITEM'): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${ymd}-${rnd}`;
  }

  // /** Tạo mới 1 nguyên liệu/hàng hóa (quantity/avgCost luôn = 0 khi khởi tạo) */
  // async create(dto: CreateInventoryitemDto): Promise<InventoryItem> {
  //   if (!dto.name?.trim()) throw new BadRequestException('NAME_REQUIRED');
  //   if (!dto.baseUomCode) throw new BadRequestException('BASE_UOM_CODE_REQUIRED');

  //   const baseUom = await this.uomRepo.findOne({ where: { code: dto.baseUomCode } });
  //   if (!baseUom) throw new BadRequestException('BASE_UOM_NOT_FOUND');

  //   let category: Category | undefined;
  //   if (dto.categoryId) {
  //     category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
  //     if (!category) throw new BadRequestException('CATEGORY_NOT_FOUND');
  //   }

  //   let suppliers: Supplier[] = [];
  //   if (dto.supplierIds?.length) {
  //     suppliers = await this.supplierRepo.find({ where: { id: In(dto.supplierIds) } });
  //     if (suppliers.length !== dto.supplierIds.length) {
  //       throw new BadRequestException('SOME_SUPPLIERS_NOT_FOUND');
  //     }
  //   }

  //   const item = this.inventoryRepo.create({
  //     code: dto.code?.trim() || this.genCode('IT'),
  //     name: dto.name.trim(),
  //     baseUom,
  //     category: category ?? undefined,
  //     suppliers,
  //     description: dto.description ?? null,
  //     alertThreshold: dto.alertThreshold ?? 0,
  //     // các field tồn kho KHÔNG cho FE set khi tạo
  //     quantity: 0,
  //     avgCost: 0,
  //   });

  //   return this.inventoryRepo.save(item);
  // }

  /** Danh sách tất cả item kèm baseUom/category/suppliers (đủ để FE hiển thị combobox đẹp) */
  async findAll(): Promise<Array<{
    id: string;
    code: string;
    name: string;
    baseUom: { code: string; name: string; dimension: UnitsOfMeasure['dimension'] };
    quantity: number;
    avgCost: number;
    alertThreshold: number;
    category?: { id: string; name: string } | null;
    suppliers?: Array<{ id: string; name: string }>;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const rows = await this.inventoryRepo.find({
      relations: ['baseUom', 'category', 'suppliers'],
      order: { createdAt: 'DESC' },
    });

    return rows.map(r => ({
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
      suppliers: (r.suppliers || []).map(s => ({ id: s.id, name: s.name })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
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
