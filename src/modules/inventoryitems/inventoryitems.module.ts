import { Module } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { InventoryitemsController } from './inventoryitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventoryitem.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { Category } from '@modules/category/entities/category.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItem, UnitsOfMeasure, Category, Supplier, UomConversion])],
  controllers: [InventoryitemsController],
  providers: [InventoryitemsService],
})
export class InventoryitemsModule { }
