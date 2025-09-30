import { Module } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { MenuitemsController } from './menuitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from './entities/menuitem.entity';
import { Category } from '../category/entities/category.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { ConfigS3Module } from 'src/common/AWS/config-s3/config-s3.module';
import { MenuComboItem } from '@modules/menucomboitem/entities/menucomboitem.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, Category, Ingredient, MenuComboItem]), ConfigS3Module],
  controllers: [MenuitemsController],
  providers: [MenuitemsService],
})
export class MenuitemsModule { }
