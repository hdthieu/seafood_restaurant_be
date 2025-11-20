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

      // Đơn vị người dùng chọn khi khai báo vật tư (KG, GOI500G, CASE24,...)
      const inputUom = await this.uomRepo.findOne({ where: { code: uomCode } });
      if (!inputUom) throw new ResponseException('UOM_NOT_FOUND', 400);

      const alertThresholdRaw = Number(dto.alertThreshold ?? 0);
      if (alertThresholdRaw < 0) throw new ResponseException('ALERT_THRESHOLD_INVALID', 400);

      // === Lấy baseCode từ chính UOM
      const baseCode = (inputUom.baseCode || inputUom.code).toUpperCase();
      const baseUom = await this.uomRepo.findOne({ where: { code: baseCode } });
      if (!baseUom) throw new ResponseException(`BASE_UOM_NOT_FOUND_${baseCode}`, 400);

      // Ngưỡng cảnh báo user nhập theo đơn vị họ chọn (KG, GOI500G,...)
      // => convert sang base (G) để lưu
      const alertThreshold = await this.convertQty(inputUom.code, baseUom.code, alertThresholdRaw);

      const quantity = 0;

      // Generate code như bạn đang làm
      const now = new Date();
      const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
      const code = `ING-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
        now.getHours(),
      )}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.floor(Math.random() * 900 + 100)}`;

      const item = this.inventoryRepo.create({
        name,
        code,
        baseUom,
        quantity,
        alertThreshold,
        description: dto.description?.trim() || null,
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
        baseUom: { code: baseUom.code, name: baseUom.name, dimension: baseUom.dimension },
        quantity: Number(saved.quantity),
        alertThreshold: Number(saved.alertThreshold),
        avgCost: Number(saved.avgCost ?? 0),
        description: saved.description,
        category: saved.category ? { id: saved.category.id, name: (saved as any).category?.name } : null,
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
        .where('i.isDeleted = :isDeleted', { isDeleted: false })
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
        description: r.description,
      }));

      return new ResponseCommon<typeof items, PageMeta>(
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


  async update(id: string, dto: UpdateInventoryitemDto): Promise<ResponseCommon<any>> {
    const item = await this.inventoryRepo.findOne({
      // Chỉ cho phép cập nhật item còn đang hoạt động (chưa bị soft delete)
      where: { id, isDeleted: false },
      relations: ['baseUom', 'category', 'suppliers'],
    });
    if (!item) {
      throw new ResponseException('ITEM_NOT_FOUND', 404);
    }

    // Không cho đổi code & baseUom qua API này
    // (nếu FE cố gửi thì bỏ qua hoặc báo lỗi)
    // Ví dụ: nếu dto có field code / unit thì chặn:
    // if ((dto as any).code || (dto as any).unit) throw new ResponseException('CANNOT_CHANGE_CODE_OR_BASEUOM', 400);

    // name
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new ResponseException('NAME_REQUIRED', 400);
      item.name = name;
    }

    // alertThreshold (ở đây hiểu là đã theo baseUom)
    if (dto.alertThreshold !== undefined) {
      const v = Number(dto.alertThreshold);
      if (v < 0) throw new ResponseException('ALERT_THRESHOLD_INVALID', 400);
      item.alertThreshold = v;
    }

    // description
    if (dto.description !== undefined) {
      item.description = dto.description?.trim() || null;
    }

    // category
    // category: allow clearing (null) or assigning existing category by id
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
      code: saved.code,
      name: saved.name,
      baseUom: {
        code: saved.baseUom.code,
        name: saved.baseUom.name,
        dimension: saved.baseUom.dimension,
      },
      quantity: Number(saved.quantity),
      avgCost: Number(saved.avgCost),
      alertThreshold: Number(saved.alertThreshold),
      description: saved.description,
      category: saved.category ? { id: saved.category.id, name: saved.category.name } : null,
      suppliers: (saved.suppliers ?? []).map(s => ({ id: s.id, name: s.name })),
      // isActive = !isDeleted để FE dễ dùng
      isActive: !saved.isDeleted,
      updatedAt: saved.updatedAt,
    });
  }

  // async remove(id: string, force = false): Promise<ResponseCommon<any>> {
  //   const item = await this.inventoryRepo.findOne({ where: { id } });
  //   if (!item) {
  //     throw new ResponseException('ITEM_NOT_FOUND', 404);
  //   }
  //   const qty = Number(item.quantity ?? 0);

  //   // Nếu caller muốn force zero stock thì tạo giao dịch WASTE
  //   if (qty > 0 && force) {
  //     const unitCost = Number(item.avgCost ?? 0);
  //     const lineCost = Number((unitCost * qty).toFixed(2));

  //     await this.invTxRepo.save(this.invTxRepo.create({
  //       item: { id: item.id } as any,
  //       quantity: qty,
  //       action: InventoryAction.WASTE,
  //       unitCost: unitCost,
  //       lineCost,
  //       beforeQty: qty,
  //       afterQty: 0,
  //       refType: 'ITEM_DEACTIVATE',
  //       refId: item.id as any,
  //       note: 'Force deactivate: zeroed stock',
  //     } as any));

  //     item.quantity = 0;
  //     item.avgCost = 0;
  //   }

  //   // Soft delete regardless of qty (we keep history)
  //   item.isDeleted = true;
  //   const saved = await this.inventoryRepo.save(item);
  //   return new ResponseCommon(200, true, 'Ngưng sử dụng vật tư thành công', {
  //     id: saved.id,
  //     hadStock: qty > 0,
  //     remainingQty: Number(saved.quantity),
  //   });
  // }

  // /** Permanently remove an item only if safety checks pass
  //  *  Criteria to allow hard delete:
  //  *   - quantity === 0
  //  *   - no inventory_transactions referencing this item
  //  *   - no purchase_receipt_items and no menu ingredients referencing this item
  //  *  Returns detailed reason if not allowed.
  //  */
  // async hardDelete(id: string): Promise<ResponseCommon<null>> {
  //   const item = await this.inventoryRepo.findOne({ where: { id } });
  //   if (!item) throw new ResponseException('ITEM_NOT_FOUND', 404);

  //   const qty = Number(item.quantity ?? 0);

  //   const txCount = await this.invTxRepo.count({ where: { item: { id } as any } });
  //   const prCount = await this.prItemRepo.count({ where: { item: { id } as any } });
  //   const ingCount = await this.ingredientRepo.count({ where: { inventoryItem: { id } as any } });

  //   const reasons: string[] = [];
  //   if (qty !== 0) reasons.push('NON_ZERO_QUANTITY');
  //   if (txCount > 0) reasons.push('HAS_INVENTORY_TRANSACTIONS');
  //   if (prCount > 0) reasons.push('HAS_PURCHASE_RECEIPT_ITEMS');
  //   if (ingCount > 0) reasons.push('USED_IN_MENU_INGREDIENTS');

  //   if (reasons.length > 0) {
  //     throw new ResponseException({ allowed: false, reasons }, 400, 'CANNOT_HARD_DELETE_ITEM');
  //   }

  //   // safe to hard delete
  //   await this.inventoryRepo.remove(item);
  //   return new ResponseCommon(200, true, 'ITEM_DELETED_PERMANENTLY', null);
  // }

}
