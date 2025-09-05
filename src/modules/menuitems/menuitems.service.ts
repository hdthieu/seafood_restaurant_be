import { Injectable } from '@nestjs/common';
import { CreateMenuItemDto } from './dto/create-menuitem.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { Repository } from 'typeorm';
import { Category } from '../category/entities/category.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { ConfigS3Service } from 'src/common/AWS/config-s3/config-s3.service';

@Injectable()
export class MenuitemsService {

  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Category)
    private readonly CategoryRepo: Repository<Category>,
    @InjectRepository(Ingredient)
    private readonly IngredientRepo: Repository<Ingredient>,
    private readonly configS3Service: ConfigS3Service,
  ) { }

  async createMenuItem(dto: CreateMenuItemDto): Promise<MenuItem> {
    const category = await this.CategoryRepo.findOneBy({ id: dto.categoryId });
    if (!category) throw new ResponseException('Danh mục không tồn tại', 400);
    let imageUrl = '';
    if (dto.image) {
      imageUrl = await this.configS3Service.uploadFile(dto.image, 'menu-items');
    }
    const menuItem = this.menuItemRepo.create({
      name: dto.name,
      price: dto.price,
      description: dto.description,
      image: imageUrl,
      category,
      isAvailable: true,
    });

    const savedItem = await this.menuItemRepo.save(menuItem);

    // Gắn nguyên liệu
    const ingredients = dto.ingredients.map((i) => {
      return this.IngredientRepo.create({
        menuItem: savedItem,
        inventoryItem: { id: i.inventoryItemId }, // chỉ cần id
        quantity: i.quantity,
        note: i.note,
      });
    });

    await this.IngredientRepo.save(ingredients);

    const fullItem = await this.menuItemRepo.findOne({
      where: { id: savedItem.id },
      relations: ['ingredients', 'ingredients.inventoryItem', 'category'],
    });

    if (!fullItem) throw new ResponseException('Không tìm thấy món sau khi tạo');

    return fullItem;
  }

}
