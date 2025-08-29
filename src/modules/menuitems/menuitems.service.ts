import { Injectable } from '@nestjs/common';
import { CreateMenuItemDto } from './dto/create-menuitem.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { Repository } from 'typeorm';
import { MenuCategory } from '../menucategory/entities/menucategory.entity';
import { MenuItemIngredient } from '../menuitemingredient/entities/menuitemingredient.entity';

@Injectable()
export class MenuitemsService {

  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly menuCategoryRepo: Repository<MenuCategory>,
    @InjectRepository(MenuItemIngredient)
    private readonly menuItemIngredientRepo: Repository<MenuItemIngredient>,
  ) { }

  async createMenuItem(dto: CreateMenuItemDto): Promise<MenuItem> {
    const category = await this.menuCategoryRepo.findOneBy({ id: dto.categoryId });
    if (!category) throw new ResponseException('Danh mục không tồn tại', 400);

    const menuItem = this.menuItemRepo.create({
      name: dto.name,
      price: dto.price,
      description: dto.description,
      image: dto.image,
      category,
      isAvailable: true,
    });

    const savedItem = await this.menuItemRepo.save(menuItem);

    // Gắn nguyên liệu
    const ingredients = dto.ingredients.map((i) => {
      return this.menuItemIngredientRepo.create({
        menuItem: savedItem,
        inventoryItem: { id: i.inventoryItemId }, // chỉ cần id
        quantity: i.quantity,
        note: i.note,
      });
    });

    await this.menuItemIngredientRepo.save(ingredients);

    const fullItem = await this.menuItemRepo.findOne({
      where: { id: savedItem.id },
      relations: ['ingredients', 'ingredients.inventoryItem', 'category'],
    });

    if (!fullItem) throw new ResponseException('Không tìm thấy món sau khi tạo');

    return fullItem;
  }

}
