import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { Injectable } from '@nestjs/common';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { MenuComboItem } from './entities/menucomboitem.entity';
import { Category } from '@modules/category/entities/category.entity';
import { UpdateComboDto } from './dto/update-combo.dto';
import { CreateComboDto } from './dto/create-combo.dto';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigS3Service } from 'src/common/AWS/config-s3/config-s3.service';

@Injectable()
export class MenucomboitemService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
    @InjectRepository(Category) private readonly catRepo: Repository<Category>,
    private readonly configS3Service: ConfigS3Service,
  ) { }

  // Create a new combo (nhận luôn file ảnh)
  async create(dto: CreateComboDto, file?: Express.Multer.File) {
    if (!dto.components?.length)
      return new ResponseCommon(400, false, 'COMPONENTS_REQUIRED');

    // 1) Upload ảnh nếu có file (giống menuitemsService)
    if (file) {
      const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-combos');
      dto.image = this.configS3Service.makeS3Url(key);
    }

    // 2) Validate components
    const ids = dto.components.map(c => c.itemId);
    const unique = Array.from(new Set(ids));
    if (unique.length !== ids.length)
      return new ResponseCommon(400, false, 'DUPLICATE_COMPONENT_ITEM');

    const childItems = await this.menuRepo.find({
      where: { id: In(unique), isCombo: false },
    });
    if (childItems.length !== unique.length) {
      return new ResponseCommon(400, false, 'SOME_ITEMS_NOT_FOUND_OR_IS_COMBO');
    }

    // 3) Category (nullable)
    let category: Category | null = null;

    // 4) Transaction tạo combo + components
    return this.ds.transaction(async em => {
      const combo = em.create(MenuItem, {
        name: dto.name,
        price: dto.comboPrice,
        isCombo: true,
        description: dto.description,
        image: dto.image ?? null,
        isAvailable: dto.isAvailable ?? true,
        category: category ?? null,
      });
      await em.save(combo);

      const rows = dto.components.map(c => {
        const item = childItems.find(i => i.id === c.itemId)!;
        return em.create(MenuComboItem, { combo, item, quantity: c.quantity });
      });
      await em.save(rows);

      return em.getRepository(MenuItem).findOne({
        where: { id: combo.id },
        relations: { components: { item: true }, category: true },
      });
    });
  }


  /** List combos */
  async findAll(page: number = 1, limit: number = 10) {
    const [data, total] = await this.menuRepo.findAndCount({
      where: { isCombo: true },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
  /** Get combo detail */
  async findOne(id: string) {
    const combo = await this.menuRepo.findOne({
      where: { id, isCombo: true },
      relations: { components: { item: true }, category: true },
    });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');
    return combo;
  }

  /** Update combo (replace components if provided) */
  async update(id: string, dto: UpdateComboDto, file?: Express.Multer.File) {
    const combo = await this.menuRepo.findOne({ where: { id, isCombo: true } });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');

    return this.ds.transaction(async em => {
      // 1) Xử lý cập nhật thông tin cơ bản
      if (dto.name !== undefined) combo.name = dto.name;
      if (dto.comboPrice !== undefined) combo.price = dto.comboPrice;
      if (dto.description !== undefined) combo.description = dto.description;
      if (dto.isAvailable !== undefined) combo.isAvailable = dto.isAvailable;

      // 3) Xử lý cập nhật ảnh (nếu có file)
      if (file) {
        const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-combos');
        combo.image = this.configS3Service.makeS3Url(key);
      }

      await em.save(combo);

      // 4) Xử lý cập nhật components (nếu có)
      if (dto.components) {
        if (!dto.components.length) return new ResponseCommon(400, false, 'COMPONENTS_REQUIRED');

        const ids = dto.components.map(c => c.itemId);
        const unique = Array.from(new Set(ids));
        if (unique.length !== ids.length) return new ResponseCommon(400, false, 'DUPLICATE_COMPONENT_ITEM');

        const childItems = await em.getRepository(MenuItem).find({
          where: { id: In(unique), isCombo: false },
        });
        if (childItems.length !== unique.length) {
          return new ResponseCommon(400, false, 'SOME_ITEMS_NOT_FOUND_OR_IS_COMBO');
        }

        await em.delete(MenuComboItem, { combo: { id: combo.id } });
        const rows = dto.components.map(c => {
          const item = childItems.find(i => i.id === c.itemId)!;
          return em.create(MenuComboItem, { combo, item, quantity: c.quantity });
        });
        await em.save(rows);
      }

      // 5) Trả về combo đã cập nhật
      return em.getRepository(MenuItem).findOne({
        where: { id: combo.id },
        relations: { components: { item: true }, category: true },
      });
    });
  }

  /** Delete combo (components auto-removed via CASCADE) */
  async remove(id: string) {
    const combo = await this.menuRepo.findOne({ where: { id, isCombo: true } });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');
    await this.menuRepo.delete(combo.id);
    return { success: true };
  }

}
