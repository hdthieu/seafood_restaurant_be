import { Module } from '@nestjs/common';
import { MenucomboitemService } from './menucomboitem.service';
import { MenucomboitemController } from './menucomboitem.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuComboItem } from './entities/menucomboitem.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { Category } from '@modules/category/entities/category.entity';
import { ConfigS3Module } from 'src/common/AWS/config-s3/config-s3.module';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, MenuComboItem, Category]), ConfigS3Module],
  controllers: [MenucomboitemController],
  providers: [MenucomboitemService],
})
export class MenucomboitemModule { }
