// menuitems.service.ts
import type { Express } from 'express';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { Category } from '../category/entities/category.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { ConfigS3Service } from 'src/common/AWS/config-s3/config-s3.service';
import { CreateMenuItemDto } from './dto/create-menuitem.dto';
import { GetMenuItemsDto } from './dto/list-menuitem.dto';
import { DataSource } from 'typeorm';
import { UpdateMenuItemDto } from './dto/update-menuitem.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { PromotionsService } from '@modules/promotions/promotions.service';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { getConversionFactorRecursive } from 'src/common/utils/uom.util';

@Injectable()
export class MenuitemsService {
  constructor(
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Category) private readonly CategoryRepo: Repository<Category>,
    @InjectRepository(Ingredient) private readonly IngredientRepo: Repository<Ingredient>,
    @InjectRepository(InventoryItem) private readonly invRepo: Repository<InventoryItem>,
    @InjectRepository(UomConversion) private readonly convRepo: Repository<UomConversion>,
    private readonly configS3Service: ConfigS3Service,
    private readonly dataSource: DataSource,
    private readonly promosSvc: PromotionsService,
  ) { }

  private async toBaseQty(inventoryItemId: string, qty: number, uomCode?: string): Promise<{ baseQty: number; selectedUomCode?: string | null; selectedQty?: number | null; }> {
    const inv = await this.invRepo.findOne({ where: { id: inventoryItemId }, relations: ['baseUom'] });
    if (!inv) throw new ResponseException('INVENTORY_ITEM_NOT_FOUND', 400);
    const baseCode = inv.baseUom.code;
    if (!uomCode || uomCode === baseCode) {
      return { baseQty: qty, selectedUomCode: uomCode ?? baseCode, selectedQty: qty };
    }
    // Try direct conversion first, otherwise attempt recursive (multi-step) conversion
    const direct = await this.convRepo.findOne({ where: { from: { code: uomCode }, to: { code: baseCode } }, relations: ['from', 'to'] });
    if (direct) {
      return { baseQty: qty * Number(direct.factor), selectedUomCode: uomCode, selectedQty: qty };
    }

    // Fallback: support chained conversions (e.g. LOC -> CHAI -> CAN)
    const factor = await getConversionFactorRecursive(this.dataSource.createEntityManager(), uomCode, baseCode);
    if (!factor || factor <= 0) throw new ResponseException(`UOM_CONVERSION_NOT_CONFIGURED`, 400);
    return { baseQty: qty * Number(factor), selectedUomCode: uomCode, selectedQty: qty };
  }

  async createMenuItem(dto: CreateMenuItemDto, file: Express.Multer.File) {
    const category = await this.CategoryRepo.findOneBy({ id: dto.categoryId });
    if (!category) throw new ResponseException('CATEGORY_NOT_FOUND', 400);

    const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-items');
    const imageUrl = this.configS3Service.makeS3Url(key);

    const savedItem = await this.menuItemRepo.save(this.menuItemRepo.create({
      name: dto.name,
      price: dto.price,
      description: dto.description,
      image: imageUrl,
      category,
      isAvailable: true,
      isReturnable: dto.isReturnable ?? false,
    }));

    const ingredientsToSave: Ingredient[] = [];
    for (const i of dto.ingredients) {
      const qty = Number(i.quantity) || 0;
      // Bỏ qua nguyên liệu có quantity <= 0
      if (qty <= 0) continue;

      const { baseQty, selectedUomCode, selectedQty } = await this.toBaseQty(i.inventoryItemId, qty, i.uomCode);
      ingredientsToSave.push(this.IngredientRepo.create({
        menuItem: savedItem,
        inventoryItem: { id: i.inventoryItemId },
        quantity: baseQty,
        selectedUom: selectedUomCode ? ({ code: selectedUomCode } as any) : null,
        selectedQty: selectedQty ?? null,
        note: i.note,
      }));
    }

    if (ingredientsToSave.length === 0) {
      throw new ResponseException('MENU_ITEM_MUST_HAVE_INGREDIENTS', 400);
    }

    await this.IngredientRepo.save(ingredientsToSave);

    const fullItem = await this.menuItemRepo.findOne({
      where: { id: savedItem.id },
      relations: ['ingredients', 'ingredients.inventoryItem', 'ingredients.selectedUom', 'category'],
    });
    if (!fullItem) throw new ResponseException('MENU_ITEM_NOT_FOUND_AFTER_CREATION');
    return fullItem;
  }

  async getList(query: GetMenuItemsDto): Promise<{
    data: Array<MenuItem & {
      priceAfterDiscount?: number;
      discountAmount?: number;
      badge?: string | null;
    }>;
    meta: PageMeta;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      categoryId,
      isAvailable,
      isCombo, // <--- Destructure thêm biến này
      minPrice,
      maxPrice,
      sortBy = 'name',
      order = 'ASC',
      withPromotions = 'true',
    } = query;

    const qb = this.menuItemRepo
      .createQueryBuilder('mi')
      .leftJoinAndSelect('mi.category', 'category')
      .leftJoinAndSelect('mi.ingredients', 'ingredients');

    if (search?.trim()) {
      qb.andWhere('(mi.name ILIKE :kw OR mi.description ILIKE :kw)', { kw: `%${search.trim()}%` });
    }
    if (categoryId) qb.andWhere('category.id = :categoryId', { categoryId });

    if (typeof isAvailable !== 'undefined') {
      qb.andWhere('mi.isAvailable = :isAvailable', { isAvailable: isAvailable === 'true' });
    }

    // --- THÊM LOGIC LỌC COMBO TẠI ĐÂY ---
    if (typeof isCombo !== 'undefined') {
      // isCombo gửi lên là string "true"/"false", cần so sánh để ra boolean
      qb.andWhere('mi.isCombo = :isCombo', { isCombo: isCombo === 'true' });
    }
    // ------------------------------------

    if (typeof minPrice === 'number') qb.andWhere('mi.price >= :minPrice', { minPrice });
    if (typeof maxPrice === 'number') qb.andWhere('mi.price <= :maxPrice', { maxPrice });

    const sortMap: Record<string, string> = { name: 'mi.name', price: 'mi.price', createdAt: 'mi.id' };
    qb.orderBy(sortMap[sortBy] ?? 'mi.name', order as 'ASC' | 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // ===== gắn giá sau khuyến mãi khi được yêu cầu =====
    const isWithPromos = withPromotions === 'true'
    let data: Array<MenuItem & {
      priceAfterDiscount?: number;
      discountAmount?: number;
      badge?: string | null;
    }> = rows;

    if (isWithPromos && rows.length) {
      const mapBest = await this.promosSvc.bestDiscountPerItem(rows);
      data = rows.map((it) => {
        const original = Math.round(Number(it.price) || 0);
        const info = mapBest.get(it.id) ?? { discount: 0, label: null as string | null };
        const hasDiscount = (info.discount || 0) > 0;
        const final = Math.max(0, original - (info.discount || 0));

        return Object.assign(it, {
          priceAfterDiscount: hasDiscount ? final : undefined,
          discountAmount: hasDiscount ? info.discount : undefined,
          badge: hasDiscount ? info.label : null,
        });
      });
    }

    const meta: PageMeta = { page, limit, total, pages: Math.ceil(total / limit) };
    return { data, meta };
  }

  async getDetail(id: string): Promise<MenuItem> {
    const item = await this.menuItemRepo.findOne({
      where: { id },
      relations: {
        category: true,
        ingredients: { inventoryItem: true, selectedUom: true }, // <-- thêm
        components: { item: true },           // nếu có combo
      },
    });

    if (!item) throw new ResponseException('MENU_ITEM_NOT_FOUND', 404);
    return item;
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto, file?: Express.Multer.File) {
    const existed = await this.menuItemRepo.findOne({
      where: { id },
      relations: ['category', 'ingredients', 'ingredients.inventoryItem'],
    });
    if (!existed) throw new ResponseException('MENU_ITEM_NOT_FOUND', 404);

    return this.dataSource.transaction(async (manager) => {
      // 1) Ảnh (tùy chọn)
      if (file) {
        const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-items');
        existed.image = this.configS3Service.makeS3Url(key);
      }

      // 2) Trường đơn
      if (typeof dto.name === 'string') existed.name = dto.name;
      if (typeof dto.description === 'string') existed.description = dto.description;
      if (typeof dto.price === 'number') existed.price = dto.price;
      if (typeof dto.isAvailable !== 'undefined') existed.isAvailable = dto.isAvailable === 'true';
      if (typeof dto.isReturnable !== 'undefined') existed.isReturnable = dto.isReturnable === 'true';
      if (dto.categoryId) {
        const cat = await manager.getRepository(Category).findOneBy({ id: dto.categoryId });
        if (!cat) throw new ResponseException('CATEGORY_NOT_FOUND', 400);
        existed.category = cat;
      }
      await manager.getRepository(MenuItem).save(existed);

      // 3) Thay toàn bộ ingredients (nếu truyền)
      if (dto.ingredients) {
        // 3.1 XÓA CŨ – dùng SQL thẳng để chắc ăn tên cột
        await manager.query(
          `DELETE FROM "ingredients" WHERE "menuItemId" = $1`,
          [existed.id],
        );

        // 3.2 Chuẩn hoá về base UOM và DEDUPE theo inventoryItemId
        // - cộng dồn baseQty
        // - nếu tất cả dòng gộp có cùng selectedUom thì lưu selectedUom và cộng selectedQty (theo selected unit)
        // - nếu có nhiều selectedUom khác nhau, để selectedUom/selectedQty = null (tránh nhầm lẫn)  
        const byInv = new Map<string, { baseQty: number; note?: string; selectedUom?: string | null; selectedQty?: number | null }>();
        for (const i of dto.ingredients) {
          if (!i?.inventoryItemId) continue;
          const norm = await this.toBaseQty(i.inventoryItemId, Number(i.quantity) || 0, (i as any).uomCode);
          const cur = byInv.get(i.inventoryItemId);
          if (cur) {
            // merge
            const prevUom = cur.selectedUom ?? null;
            const newUom = norm.selectedUomCode ?? null;
            let mergedSelectedUom: string | null;
            let mergedSelectedQty: number | null;
            if (prevUom == null || newUom == null) {
              // if any side is null, result is null (ambiguous)
              mergedSelectedUom = null;
              mergedSelectedQty = null;
            } else if (prevUom !== newUom) {
              // different selected UOMs -> try to convert newUom qty into prevUom and keep prevUom
              // we can compute prev factor from stored baseQty and selectedQty if available
              const prevSelectedQty = cur.selectedQty ?? null;
              if (prevSelectedQty && prevSelectedQty > 0) {
                const prevFactor = (cur.baseQty ?? 0) / Number(prevSelectedQty);
                if (prevFactor > 0) {
                  // convert norm.baseQty into prevUom units
                  const convertedQty = (norm.baseQty) / prevFactor;
                  mergedSelectedUom = prevUom;
                  mergedSelectedQty = (cur.selectedQty ?? 0) + convertedQty;
                } else {
                  mergedSelectedUom = null;
                  mergedSelectedQty = null;
                }
              } else {
                // cannot determine conversion -> ambiguous
                mergedSelectedUom = null;
                mergedSelectedQty = null;
              }
            } else {
              // same selected UOM -> sum selectedQty
              mergedSelectedUom = prevUom;
              mergedSelectedQty = (cur.selectedQty ?? 0) + (norm.selectedQty ?? 0);
            }

            byInv.set(i.inventoryItemId, {
              baseQty: (cur.baseQty ?? 0) + norm.baseQty,
              note: cur.note ?? i.note,
              selectedUom: mergedSelectedUom,
              selectedQty: mergedSelectedQty,
            });
          } else {
            byInv.set(i.inventoryItemId, {
              baseQty: norm.baseQty,
              note: i.note,
              selectedUom: norm.selectedUomCode ?? null,
              selectedQty: norm.selectedQty ?? null,
            });
          }
        }

        const values = Array.from(byInv.entries()).map(([inventoryItemId, v]) => ({
          menuItem: { id: existed.id } as any,
          inventoryItem: { id: inventoryItemId } as any,
          quantity: v.baseQty,
          selectedUom: v.selectedUom ? ({ code: v.selectedUom } as any) : null,
          selectedQty: v.selectedQty ?? null,
          note: v.note,
        }));

        if (values.length) {
          // 3.3 INSERT một mạch để tránh upsert đụng unique trong cùng batch
          await manager
            .createQueryBuilder()
            .insert()
            .into(Ingredient)
            .values(values)
            .execute();
        }
      }

      // 4) Trả về full relations
      const full = await manager.getRepository(MenuItem).findOne({
        where: { id: existed.id },
        relations: [
          'category',
          'ingredients',
          'ingredients.inventoryItem',
          'ingredients.selectedUom',
          'components',
          'components.item',
        ],
      });
      if (!full) throw new ResponseException('MENU_ITEM_NOT_FOUND_AFTER_UPDATE', 500);
      return full;
    });
  }

  async deleteMenuItem(id: string) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Kiểm tra menu item tồn tại
      const menuItem = await manager.findOne(MenuItem, {
        where: { id },
        relations: ['category']
      });
      if (!menuItem) {
        throw new ResponseException('MENU_ITEM_NOT_FOUND', 404);
      }

      // 2. Kiểm tra có order items nào đang sử dụng menu item này không
      const orderItemCount = await manager.count('OrderItem', {
        where: { menuItem: { id } }
      });

      if (orderItemCount > 0) {
        throw new ResponseException('MENU_ITEM_IN_USE_BY_ORDERS', 400);
      }

      // 3. Kiểm tra có kitchen tickets nào đang sử dụng menu item này không
      const kitchenTicketCount = await manager.count('KitchenTicket', {
        where: { menuItem: { id } }
      });

      if (kitchenTicketCount > 0) {
        throw new ResponseException('MENU_ITEM_IN_USE_BY_KITCHEN_TICKETS', 400);
      }

      // 4. Kiểm tra có promotion nào đang áp dụng cho menu item này không
      const promotionItemCount = await manager.query(
        `SELECT COUNT(*) as count FROM "promotion_items" WHERE "item_id" = $1`,
        [id]
      );

      if (parseInt(promotionItemCount[0].count) > 0) {
        throw new ResponseException('MENU_ITEM_IN_USE_BY_PROMOTIONS', 400);
      }

      // 5. Kiểm tra có phải là combo cha không (có menu combo items)
      const comboItemCount = await manager.count('MenuComboItem', {
        where: { combo: { id } }
      });

      if (comboItemCount > 0) {
        throw new ResponseException('MENU_ITEM_HAS_COMBO_CHILDREN', 400);
      }

      // 6. Kiểm tra có phải là item con trong combo nào khác không
      const parentComboCount = await manager.count('MenuComboItem', {
        where: { item: { id } }
      });

      if (parentComboCount > 0) {
        throw new ResponseException('MENU_ITEM_IS_COMBO_COMPONENT', 400);
      }

      // 7. Xóa ingredients liên quan
      await manager.query(`DELETE FROM "ingredients" WHERE "menuItemId" = $1`, [id]);

      // 8. Xóa menu item
      await manager.delete(MenuItem, { id });

      return { message: 'Xóa món ăn thành công' };
    });
  }

}
