import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(InventoryItem) private readonly inventoryItemRepo: Repository<InventoryItem>,
  ) { }

  // dùng để chuẩn hoá tên (loại bỏ khoảng trắng thừa, ...)
  private normalizeName(name: string) {
    return name?.trim().replace(/\s+/g, ' ');
  }

  async create(dto: CreateCategoryDto) {
    const name = this.normalizeName(dto.name);
    if (!name) throw new ResponseException('CATEGORY_NAME_REQUIRED', 400);

    // Unique (name,type) không phân biệt hoa thường
    const existed = await this.categoryRepo.findOne({
      where: { name: ILike(name), type: dto.type },
    });
    if (existed) throw new ResponseException('CATEGORY_NAME_DUPLICATED', 400);

    const entity = this.categoryRepo.create({
      name,
      description: dto.description?.trim(),
      type: dto.type,
      isActive: true,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.categoryRepo.save(entity);
  }

  // dung để tìm kiếm, filter, phân trang
  async findAll(q: QueryCategoryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const skip = (page - 1) * limit;

    // sort: "field:ASC|DESC"
    let order: Record<string, 'ASC' | 'DESC'> = { sortOrder: 'ASC', createdAt: 'DESC' };
    if (q.sort) {
      const [field, dirRaw] = q.sort.split(':');
      const dir = (dirRaw ?? 'ASC').toUpperCase() as 'ASC' | 'DESC';
      if (['ASC', 'DESC'].includes(dir) && field) {
        order = { [field]: dir };
      }
    }

    const where: any = {};
    if (q.type) where.type = q.type;
    if (q.isActive === 'true') where.isActive = true;
    if (q.isActive === 'false') where.isActive = false;
    if (q.q) {
      // tìm theo name/description (ILIKE ~ không phân biệt hoa thường)
      where['name'] = ILike(`%${q.q.trim()}%`);
      // nếu muốn OR theo description thì dùng queryBuilder bên dưới
    }

    // Dùng queryBuilder để OR name/description + các filter khác
    const qb = this.categoryRepo.createQueryBuilder('c')
      .where('1=1');

    if (q.type) qb.andWhere('c.type = :type', { type: q.type });
    if (q.isActive === 'true') qb.andWhere('c.isActive = true');
    if (q.isActive === 'false') qb.andWhere('c.isActive = false');
    if (q.q) qb.andWhere('(c.name ILIKE :kw OR c.description ILIKE :kw)', { kw: `%${q.q.trim()}%` });

    // order
    const orderField = Object.keys(order)[0];
    const orderDir = order[orderField];
    qb.orderBy(`c.${orderField}`, orderDir);

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const entity = await this.categoryRepo.findOne({ where: { id } });
    if (!entity) throw new ResponseException('Không tìm thấy danh mục', 404);
    return entity;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const entity = await this.categoryRepo.findOne({ where: { id } });
    if (!entity) throw new ResponseException('Không tìm thấy danh mục', 404);

    // Nếu đổi type, kiểm tra tham chiếu
    if (dto.type && dto.type !== entity.type) {
      await this.ensureNoReferences(id, entity.type); // chỉ cho đổi type nếu không bị tham chiếu
      entity.type = dto.type;
    }

    if (dto.name) {
      const name = this.normalizeName(dto.name);
      // unique (name,type) khác id hiện tại
      const dup = await this.categoryRepo.createQueryBuilder('c')
        .where('LOWER(c.name) = LOWER(:name)', { name })
        .andWhere('c.type = :type', { type: entity.type })
        .andWhere('c.id <> :id', { id })
        .getOne();
      if (dup) throw new ResponseException(`Danh mục "${name}" (${entity.type}) đã tồn tại`, 400);

      entity.name = name;
    }

    if (dto.description !== undefined) {
      entity.description = dto.description?.trim();
    }
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;

    return this.categoryRepo.save(entity);
  }

  // Dung để bật/tắt hoạt động
  private async ensureNoReferences(categoryId: string, type: string) {
    if (type === 'MENU') {
      const countMenu = await this.menuItemRepo.count({ where: { category: { id: categoryId } as any } });
      if (countMenu > 0) {
        throw new ResponseException('Không thể thực hiện: Danh mục đang được sử dụng bởi món ăn', 400);
      }
    }
    if (type === 'INGREDIENT') {
      // Chỉ kiểm nếu InventoryItem có FK category
      if (this.inventoryItemRepo) {
        const countInv = await this.inventoryItemRepo.count({ where: { category: { id: categoryId } as any } });
        if (countInv > 0) {
          throw new ResponseException('Không thể thực hiện: Danh mục đang được sử dụng bởi nguyên liệu', 400);
        }
      }
    }
  }
}
