import { Module } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { InventoryitemsController } from './inventoryitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventoryitem.entity';
import { CategoryModule } from '../category/category.module';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItem]), CategoryModule],
  controllers: [InventoryitemsController],
  providers: [InventoryitemsService],
})
export class InventoryitemsModule { }
