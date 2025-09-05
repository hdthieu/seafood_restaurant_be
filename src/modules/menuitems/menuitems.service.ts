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
import { GetMenuItemsDto, PageMeta } from './dto/list-menuitem.dto';

@Injectable()
export class MenuitemsService {
  constructor(
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Category) private readonly CategoryRepo: Repository<Category>,
    @InjectRepository(Ingredient) private readonly IngredientRepo: Repository<Ingredient>,
    private readonly configS3Service: ConfigS3Service,
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
      totalPages: Math.ceil(total / limit),
    };
    return { data: rows, meta };
  }

  async getDetail(id: string): Promise<MenuItem> {
    const item = await this.menuItemRepo.findOne({
      where: { id },
      relations: { category: true, ingredients: true },
    });

    if (!item) throw new ResponseException('Không tìm thấy món', 404);
    return item;
  }
}
