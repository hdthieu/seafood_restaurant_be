// inventoryitems.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './entities/inventoryitem.entity';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { Ingredient } from '@modules/ingredient/entities/ingredient.entity';
import { InventoryAction } from 'src/common/enums';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items.query.dto';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { ListIngredientsDto } from './dto/list-ingredients.dto';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { Category } from '@modules/category/entities/category.entity';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';


@Injectable()
export class InventoryitemsService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,

    @InjectRepository(UomConversion)
    private readonly convRepo: Repository<UomConversion>,

    @InjectRepository(UnitsOfMeasure)
    private readonly uomRepo: Repository<UnitsOfMeasure>,
    @InjectRepository(InventoryTransaction)
    private readonly invTxRepo: Repository<InventoryTransaction>,
    @InjectRepository(PurchaseReceiptItem)
    private readonly prItemRepo: Repository<PurchaseReceiptItem>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) { }

  // private readonly BASE_BY_DIM: Record<UnitsOfMeasure['dimension'], string> = {
  //   mass: 'G',
  //   volume: 'ML',
  //   count: 'EA',
  //   length: 'EA',
  // };

  // 1 from = factor * to => qty_to = qty_from * factor
  private async convertQty(fromCode: string, toCode: string, qty: number): Promise<number> {
    if (fromCode === toCode) return qty;

    const conv = await this.convRepo.findOne({
      where: { from: { code: fromCode }, to: { code: toCode } },
      relations: ['from', 'to'],
    });

    if (!conv) {
      throw new ResponseException(`NO_CONVERSION_${fromCode}_TO_${toCode}`);
    }

    return qty * Number(conv.factor);
  }

  /** Tạo mới vật tư (nguyên liệu) trong kho */
  async create(dto: CreateInventoryitemDto): Promise<ResponseCommon<any>> {
    try {
      const name = (dto.name || '').trim();
      const uomCode = (dto.unit || '').trim().toUpperCase();
      if (!name) throw new ResponseException('NAME_REQUIRED', 400);
      if (!uomCode) throw new ResponseException('UOM_REQUIRED', 400);

      const inputUom = await this.uomRepo.findOne({ where: { code: uomCode } });
      if (!inputUom) throw new ResponseException('UOM_NOT_FOUND', 400);

      const alertThresholdRaw = Number(dto.alertThreshold ?? 0);
      if (alertThresholdRaw < 0) throw new ResponseException('ALERT_THRESHOLD_INVALID', 400);

      const baseCode = (inputUom.baseCode || inputUom.code).toUpperCase();
      const baseUom = await this.uomRepo.findOne({ where: { code: baseCode } });
      if (!baseUom) throw new ResponseException(`BASE_UOM_NOT_FOUND_${baseCode}`, 400);

      const alertThreshold = await this.convertQty(inputUom.code, baseUom.code, alertThresholdRaw);

      // Generate code
      const now = new Date();
      const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
      const code = `ING-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      const item = this.inventoryRepo.create({
        name,
        code,
        baseUom,
        quantity: 0,
        alertThreshold,
        description: dto.description?.trim() || null,
        isDeleted: false, // Mặc định active
      });

      if (dto.categoryId) {
        const cat = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
        if (!cat) throw new ResponseException('CATEGORY_NOT_FOUND', 400);
        item.category = cat;
      }

      const saved = await this.inventoryRepo.save(item);

      return new ResponseCommon(201, true, 'Tạo vật tư thành công', {
        id: saved.id,
        code: saved.code,
        name: saved.name,
        baseUom: { code: baseUom.code, name: baseUom.name },
        quantity: Number(saved.quantity),
        alertThreshold: Number(saved.alertThreshold),
        isActive: true, // [MỚI] Trả về isActive
        category: saved.category ? { id: saved.category.id, name: saved.category.name } : null,
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
        .take(limit);

      if (dto.isActive !== undefined) {
        qb.andWhere('i.isDeleted = :isDeleted', { isDeleted: !dto.isActive });
      }

      // --- Search ---
      const q = dto.q?.trim();
      if (q) {
        const kw = `%${q.toLowerCase()}%`;
        qb.andWhere('(LOWER(i.name) LIKE :kw OR LOWER(u.name) LIKE :kw OR LOWER(u.code) LIKE :kw)', { kw });
      }

      // --- Filter Base UOM ---
      if (dto.baseUomCode?.trim()) {
        qb.andWhere('u.code = :uom', { uom: dto.baseUomCode.trim().toUpperCase() });
      }

      // --- Filter Stock ---
      switch (dto.stock) {
        case 'BELOW': qb.andWhere('i.quantity < i.alertThreshold'); break;
        case 'OVER': qb.andWhere('i.quantity > i.alertThreshold'); break;
        case 'IN_STOCK': qb.andWhere('i.quantity > 0'); break;
        case 'OUT_OF_STOCK': qb.andWhere('i.quantity = 0'); break;
      }

      // --- Filter Supplier ---
      if (dto.supplierId) {
        qb.andWhere('s.id = :sid', { sid: dto.supplierId });
      }

      const [rows, total] = await qb.getManyAndCount();

      const items = rows.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        baseUom: {
          code: r.baseUom.code,
          name: r.baseUom.name,
        },
        quantity: Number(r.quantity),
        avgCost: Number(r.avgCost),
        alertThreshold: Number(r.alertThreshold),
        category: r.category ? { id: r.category.id, name: r.category.name } : null,
        suppliers: (r.suppliers ?? []).map(s => ({ id: s.id, name: s.name })),
        isActive: !r.isDeleted, // [MỚI] Map isActive từ isDeleted
        isDeleted: r.isDeleted,  // Trả về cả isDeleted cho rõ ràng
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        description: r.description,
      }));

      return new ResponseCommon(
        200,
        true,
        'Lấy danh sách vật tư thành công',
        items,
        { total, page, limit, pages: Math.ceil(total / limit) || 0 },
      );
    } catch (error) {
      throw new ResponseException(error, 400, 'CANNOT_GET_INVENTORY_ITEMS');
    }
  }

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


  async update(id: string, dto: UpdateInventoryitemDto): Promise<ResponseCommon<any>> {
    // Chỉ update được item chưa bị xóa vĩnh viễn (isDeleted=true vẫn update được để sửa thông tin nếu muốn, tùy nghiệp vụ)
    // Ở đây ta cho phép update cả item đã ngưng sử dụng
    const item = await this.inventoryRepo.findOne({
      where: { id },
      relations: ['baseUom', 'category', 'suppliers'],
    });
    if (!item) throw new ResponseException('ITEM_NOT_FOUND', 404);

    if ((dto as any).code || (dto as any).unit) throw new ResponseException('CANNOT_CHANGE_CODE_OR_BASEUOM', 400);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new ResponseException('NAME_REQUIRED', 400);
      item.name = name;
    }

    if (dto.alertThreshold !== undefined) {
      const v = Number(dto.alertThreshold);
      if (v < 0) throw new ResponseException('ALERT_THRESHOLD_INVALID', 400);
      item.alertThreshold = v;
    }

    if (dto.description !== undefined) {
      item.description = dto.description?.trim() || null;
    }

    if ((dto as any).categoryId !== undefined) {
      if ((dto as any).categoryId === null) {
        item.category = null as any;
      } else {
        const cat = await this.categoryRepo.findOne({ where: { id: (dto as any).categoryId } });
        if (!cat) throw new ResponseException('CATEGORY_NOT_FOUND', 400);
        item.category = cat;
      }
    }

    const saved = await this.inventoryRepo.save(item);

    return new ResponseCommon(200, true, 'Cập nhật vật tư thành công', {
      id: saved.id,
      name: saved.name,
      quantity: Number(saved.quantity),
      isActive: !saved.isDeleted, // [MỚI]
      // ... các trường khác
    });
  }

  // =================================================================================
  // 4. REMOVE (SOFT DELETE - NGƯNG SỬ DỤNG)
  // =================================================================================
  async remove(id: string, force = false): Promise<ResponseCommon<any>> {
    const item = await this.inventoryRepo.findOne({ where: { id } });
    if (!item) throw new ResponseException('ITEM_NOT_FOUND', 404);

    if (item.isDeleted) {
      throw new ResponseException('ITEM_ALREADY_DELETED', 400);
    }

    const qty = Number(item.quantity ?? 0);

    // 1. Check tham chiếu (Logic cũ của bạn - tốt)
    const txCount = await this.invTxRepo.count({ where: { item: { id } as any } });
    const prCount = await this.prItemRepo.count({ where: { item: { id } as any } });
    const ingCount = await this.ingredientRepo.count({ where: { inventoryItem: { id } as any } });
    const hadHistory = txCount > 0 || prCount > 0 || ingCount > 0;

    // 2. Xử lý tồn kho nếu force = true
    if (qty > 0 && force) {
      const unitCost = Number(item.avgCost ?? 0);
      const lineCost = Number((unitCost * qty).toFixed(2));

      await this.invTxRepo.save(this.invTxRepo.create({
        item: { id: item.id } as any,
        quantity: qty,
        action: InventoryAction.WASTE, // Xuất hủy
        unitCost: unitCost,
        lineCost,
        beforeQty: qty,
        afterQty: 0,
        refType: 'ITEM_DEACTIVATE',
        refId: item.id as any,
        note: 'Hệ thống: Ngưng sử dụng và hủy tồn kho',
      } as any));

      item.quantity = 0 as any;
      item.avgCost = 0 as any;
    }

    // 3. Đánh dấu đã xóa (isActive = false)
    item.isDeleted = true;
    const saved = await this.inventoryRepo.save(item);

    return new ResponseCommon(200, true, 'Ngưng sử dụng vật tư thành công', {
      id: saved.id,
      isActive: false, // [MỚI]
      hadStock: qty > 0,
      remainingQty: Number(saved.quantity),
    });
  }

  // =================================================================================
  // 5. RESTORE (KHÔI PHỤC HOẠT ĐỘNG) - [MỚI]
  // =================================================================================
  async restore(id: string): Promise<ResponseCommon<any>> {
    const item = await this.inventoryRepo.findOne({ where: { id } });
    if (!item) throw new ResponseException('ITEM_NOT_FOUND', 404);

    if (!item.isDeleted) {
      throw new ResponseException('ITEM_IS_ALREADY_ACTIVE', 400);
    }

    // Đánh dấu hoạt động trở lại
    item.isDeleted = false;
    const saved = await this.inventoryRepo.save(item);

    return new ResponseCommon(200, true, 'Khôi phục vật tư thành công', {
      id: saved.id,
      name: saved.name,
      isActive: true, // [MỚI]
    });
  }

  // =================================================================================
  // 6. HARD DELETE (XÓA VĨNH VIỄN)
  // =================================================================================
  async hardDelete(id: string): Promise<ResponseCommon<null>> {
    const item = await this.inventoryRepo.findOne({ where: { id } });
    if (!item) throw new ResponseException('ITEM_NOT_FOUND', 404);

    const qty = Number(item.quantity ?? 0);
    const txCount = await this.invTxRepo.count({ where: { item: { id } as any } });
    const prCount = await this.prItemRepo.count({ where: { item: { id } as any } });
    const ingCount = await this.ingredientRepo.count({ where: { inventoryItem: { id } as any } });

    const reasons: string[] = [];
    if (qty !== 0) reasons.push('NON_ZERO_QUANTITY');
    if (txCount > 0) reasons.push('HAS_INVENTORY_TRANSACTIONS');
    if (prCount > 0) reasons.push('HAS_PURCHASE_RECEIPT_ITEMS');
    if (ingCount > 0) reasons.push('USED_IN_MENU_INGREDIENTS');

    if (reasons.length > 0) {
      throw new ResponseException({ allowed: false, reasons }, 400, 'CANNOT_HARD_DELETE_ITEM');
    }

    await this.inventoryRepo.remove(item);
    return new ResponseCommon(200, true, 'Xóa vĩnh viễn vật tư thành công', null);
  }

}
