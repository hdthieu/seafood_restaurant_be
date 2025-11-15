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
    if (!inv) throw new ResponseException('Nguyên liệu không tồn tại', 400);
    const baseCode = inv.baseUom.code;
    if (!uomCode || uomCode === baseCode) {
      return { baseQty: qty, selectedUomCode: uomCode ?? baseCode, selectedQty: qty };
    }
    const conv = await this.convRepo.findOne({ where: { from: { code: uomCode }, to: { code: baseCode } }, relations: ['from', 'to'] });
    if (!conv) throw new ResponseException(`Chưa cấu hình quy đổi UOM từ ${uomCode} -> ${baseCode}`, 400);
    return { baseQty: qty * Number(conv.factor), selectedUomCode: uomCode, selectedQty: qty };
  }

  async createMenuItem(dto: CreateMenuItemDto, file: Express.Multer.File) {
    const category = await this.CategoryRepo.findOneBy({ id: dto.categoryId });
    if (!category) throw new ResponseException('Danh mục không tồn tại', 400);

    const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-items');
    const imageUrl = this.configS3Service.makeS3Url(key);

    const savedItem = await this.menuItemRepo.save(this.menuItemRepo.create({
      name: dto.name,
      price: dto.price,
      description: dto.description,
      image: imageUrl,
      category,
      isAvailable: true,
    }));

    const ingredientsToSave: Ingredient[] = [];
    for (const i of dto.ingredients) {
      const { baseQty, selectedUomCode, selectedQty } = await this.toBaseQty(i.inventoryItemId, Number(i.quantity) || 0, i.uomCode);
      ingredientsToSave.push(this.IngredientRepo.create({
        menuItem: savedItem,
        inventoryItem: { id: i.inventoryItemId },
        quantity: baseQty,
        selectedUom: selectedUomCode ? ({ code: selectedUomCode } as any) : null,
        selectedQty: selectedQty ?? null,
        note: i.note,
      }));
    }
    await this.IngredientRepo.save(ingredientsToSave);

    const fullItem = await this.menuItemRepo.findOne({
      where: { id: savedItem.id },
      relations: ['ingredients', 'ingredients.inventoryItem', 'category'],
    });
    if (!fullItem) throw new ResponseException('Không tìm thấy món sau khi tạo');
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
      limit = 20,
      search,
      categoryId,
      isAvailable,
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

    if (!item) throw new ResponseException('Không tìm thấy món', 404);
    return item;
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto, file?: Express.Multer.File) {
    const existed = await this.menuItemRepo.findOne({
      where: { id },
      relations: ['category', 'ingredients', 'ingredients.inventoryItem'],
    });
    if (!existed) throw new ResponseException('Không tìm thấy món', 404);

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
      if (dto.categoryId) {
        const cat = await manager.getRepository(Category).findOneBy({ id: dto.categoryId });
        if (!cat) throw new ResponseException('Danh mục không tồn tại', 400);
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

        // 3.2 Chuẩn hoá về base UOM và DEDUPE theo inventoryItemId (cộng dồn baseQty, giữ note đầu tiên)
        const byInv = new Map<string, { baseQty: number; note?: string }>();
        for (const i of dto.ingredients) {
          if (!i?.inventoryItemId) continue;
          const norm = await this.toBaseQty(i.inventoryItemId, Number(i.quantity) || 0, (i as any).uomCode);
          const cur = byInv.get(i.inventoryItemId);
          byInv.set(i.inventoryItemId, {
            baseQty: (cur?.baseQty ?? 0) + norm.baseQty,
            note: cur?.note ?? i.note,
          });
        }
        const values = Array.from(byInv.entries()).map(([inventoryItemId, v]) => ({
          menuItem: { id: existed.id } as any,
          inventoryItem: { id: inventoryItemId } as any,
          quantity: v.baseQty,
          selectedUom: null as any, // khi gộp nhiều dòng với đơn vị khác nhau, không lưu đơn vị người dùng để tránh sai lệch
          selectedQty: null as any,
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
          'components',
          'components.item',
        ],
      });
      if (!full) throw new ResponseException('Cập nhật xong nhưng không thấy dữ liệu', 500);
      return full;
    });
  }




}
