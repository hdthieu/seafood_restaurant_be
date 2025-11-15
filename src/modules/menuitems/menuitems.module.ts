import { Module } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { MenuitemsController } from './menuitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { Category } from '../category/entities/category.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { ConfigS3Module } from 'src/common/AWS/config-s3/config-s3.module';
import { MenuComboItem } from '@modules/menucomboitem/entities/menucomboitem.entity';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, Category, Ingredient, MenuComboItem, UomConversion, InventoryItem]), ConfigS3Module, PromotionsModule],
  controllers: [MenuitemsController],
  providers: [MenuitemsService],
})
export class MenuitemsModule { }
