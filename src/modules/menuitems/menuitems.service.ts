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

@Injectable()
export class MenuitemsService {
  constructor(
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Category) private readonly CategoryRepo: Repository<Category>,
    @InjectRepository(Ingredient) private readonly IngredientRepo: Repository<Ingredient>,
    private readonly configS3Service: ConfigS3Service,
    private readonly dataSource: DataSource,
  ) { }

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

    const ingredients = dto.ingredients.map(i => this.IngredientRepo.create({
      menuItem: savedItem,
      inventoryItem: { id: i.inventoryItemId },
      quantity: i.quantity,
      note: i.note,
    }));
    await this.IngredientRepo.save(ingredients);

    const fullItem = await this.menuItemRepo.findOne({
      where: { id: savedItem.id },
      relations: ['ingredients', 'ingredients.inventoryItem', 'category'],
    });
    if (!fullItem) throw new ResponseException('Không tìm thấy món sau khi tạo');
    return fullItem;
  }

  async getList(query: GetMenuItemsDto): Promise<{ data: MenuItem[]; meta: PageMeta }> {
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
    } = query;

    const qb = this.menuItemRepo
      .createQueryBuilder('mi')
      .leftJoinAndSelect('mi.category', 'category')
      .leftJoinAndSelect('mi.ingredients', 'ingredients'); // nếu Ingredient có thêm quan hệ khác thì join tiếp

    // search (name/description)
    if (search?.trim()) {
      qb.andWhere('(mi.name ILIKE :kw OR mi.description ILIKE :kw)', { kw: `%${search.trim()}%` });
    }

    // lọc category
    if (categoryId) {
      qb.andWhere('category.id = :categoryId', { categoryId });
    }

    // lọc isAvailable
    if (typeof isAvailable !== 'undefined') {
      qb.andWhere('mi.isAvailable = :isAvailable', { isAvailable: isAvailable === 'true' });
    }

    // lọc khoảng giá
    if (typeof minPrice === 'number') {
      qb.andWhere('mi.price >= :minPrice', { minPrice });
    }
    if (typeof maxPrice === 'number') {
      qb.andWhere('mi.price <= :maxPrice', { maxPrice });
    }

    // sắp xếp
    const sortMap: Record<string, string> = {
      name: 'mi.name',
      price: 'mi.price',
      createdAt: 'mi.id', // nếu có trường createdAt thì thay bằng mi.createdAt
    };
    qb.orderBy(sortMap[sortBy] ?? 'mi.name', order as 'ASC' | 'DESC');

    // phân trang
    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const meta: PageMeta = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
    return { data: rows, meta };
  }

  async getDetail(id: string): Promise<MenuItem> {
    const item = await this.menuItemRepo.findOne({
      where: { id },
      relations: {
        category: true,
        ingredients: { inventoryItem: true }, // <-- thêm
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

        // 3.2 DEDUPE theo inventoryItemId (cộng dồn quantity, giữ note đầu tiên)
        const byInv = new Map<string, { quantity: number; note?: string }>();
        for (const i of dto.ingredients) {
          if (!i?.inventoryItemId) continue;
          const q = Number(i.quantity) || 0;
          const cur = byInv.get(i.inventoryItemId);
          byInv.set(i.inventoryItemId, {
            quantity: (cur?.quantity ?? 0) + q,
            note: cur?.note ?? i.note,
          });
        }
        const values = Array.from(byInv.entries()).map(([inventoryItemId, v]) => ({
          menuItem: { id: existed.id } as any,
          inventoryItem: { id: inventoryItemId } as any,
          quantity: v.quantity,
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
