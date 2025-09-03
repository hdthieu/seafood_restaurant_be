import { Module } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { MenuitemsController } from './menuitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { MenuCategory } from '../menucategory/entities/menucategory.entity';
import { MenuItemIngredient } from '../menuitemingredient/entities/menuitemingredient.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, MenuCategory, MenuItemIngredient])],
  controllers: [MenuitemsController],
  providers: [MenuitemsService],
})
export class MenuitemsModule { }
