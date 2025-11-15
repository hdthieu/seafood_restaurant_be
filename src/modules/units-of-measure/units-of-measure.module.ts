import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsOfMeasure } from './entities/units-of-measure.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { UnitsOfMeasureController } from './units-of-measure.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnitsOfMeasure, UomConversion, InventoryItem])],
  controllers: [UnitsOfMeasureController],
  providers: [UnitsOfMeasureService],
  // exports: [TypeOrmModule],
})
export class UnitsOfMeasureModule { }