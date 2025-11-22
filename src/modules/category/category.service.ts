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
    if (!name) throw new ResponseException(false, 400, 'CATEGORY_NAME_REQUIRED');

    // Unique (name,type) không phân biệt hoa thường
    const existed = await this.categoryRepo.findOne({
      where: { name: ILike(name), type: dto.type },
    });
    if (existed) throw new ResponseException(false, 400, 'CATEGORY_NAME_DUPLICATED');

    const entity = this.categoryRepo.create({
      name,
      description: dto.description?.trim(),
      type: dto.type,
      isActive: true,
    });

    return this.categoryRepo.save(entity);
  }

  // dung để tìm kiếm, filter, phân trang
  async findAll(q: QueryCategoryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const skip = (page - 1) * limit;

    // sort: "field:ASC|DESC"
    // Không sử dụng sortOrder nữa. Mặc định sắp theo createdAt DESC
    let order: Record<string, 'ASC' | 'DESC'> = { createdAt: 'DESC' };
    if (q.sort) {
      const [field, dirRaw] = q.sort.split(':');
      const dir = (dirRaw ?? 'ASC').toUpperCase() as 'ASC' | 'DESC';
      // chỉ cho phép sort theo những trường thực sự tồn tại trên entity để tránh lỗi DB
      const allowedFields = ['createdAt', 'updatedAt', 'name', 'isActive', 'id'];
      if (['ASC', 'DESC'].includes(dir) && field && allowedFields.includes(field)) {
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
    if (!entity) throw new ResponseException(false, 404, 'CATEGORY_NOT_FOUND');
    return entity;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const entity = await this.categoryRepo.findOne({ where: { id } });
    if (!entity) throw new ResponseException(false, 404, 'CATEGORY_NOT_FOUND');

    // 1. Xác định trạng thái đích (Target State)
    // Nếu DTO không gửi lên thì dùng giá trị cũ
    const targetType = dto.type ?? entity.type;
    const targetName = dto.name ? this.normalizeName(dto.name) : entity.name;

    // 2. Kiểm tra thay đổi Type hoặc Deactivate
    const isTypeChanged = dto.type && dto.type !== entity.type;
    const isDeactivating = dto.isActive === false;

    // Nếu đổi Type hoặc Tắt hoạt động -> Phải đảm bảo Type CŨ không bị tham chiếu
    if (isTypeChanged || isDeactivating) {
      await this.ensureNoReferences(id, entity.type);
    }

    // 3. Kiểm tra trùng lặp Name + Type (nếu có thay đổi)
    const isNameChanged = dto.name && targetName !== entity.name;

    // Chỉ check DB khi có sự thay đổi về Name hoặc Type
    if (isNameChanged || isTypeChanged) {
      const dup = await this.categoryRepo.createQueryBuilder('c')
        .where('LOWER(c.name) = LOWER(:name)', { name: targetName })
        .andWhere('c.type = :type', { type: targetType })
        .andWhere('c.id <> :id', { id })
        .getOne();

      if (dup) {
        throw new ResponseException(false, 400, 'CATEGORY_NAME_DUPLICATED');
      }
    }

    // 4. Apply thay đổi (Chỉ gán khi mọi check đã pass)
    entity.type = targetType;
    entity.name = targetName;

    if (dto.description !== undefined) {
      entity.description = dto.description?.trim();
    }
    if (dto.isActive !== undefined) {
      entity.isActive = dto.isActive;
    }

    return this.categoryRepo.save(entity);
  }

  // Dung để bật/tắt hoạt động
  private async ensureNoReferences(categoryId: string, type: string) {
    if (type === 'MENU') {
      const countMenu = await this.menuItemRepo.count({ where: { category: { id: categoryId } as any } });
      if (countMenu > 0) {
        throw new ResponseException(false, 400, 'CATEGORY_IN_USE_BY_MENU_ITEMS');
      }
    }
    if (type === 'INGREDIENT') {
      // Chỉ kiểm nếu InventoryItem có FK category
      if (this.inventoryItemRepo) {
        const countInv = await this.inventoryItemRepo.count({ where: { category: { id: categoryId } as any } });
        if (countInv > 0) {
          throw new ResponseException(false, 400, 'CATEGORY_IN_USE_BY_INVENTORY_ITEMS');
        }
      }
    }
  }

  async delete(id: string) {
    const entity = await this.findOne(id);
    await this.ensureNoReferences(id, entity.type); // Kiểm tra không có tham chiếu
    return this.categoryRepo.remove(entity);
  }
}
