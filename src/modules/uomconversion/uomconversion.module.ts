import { Module } from '@nestjs/common';
import { UomconversionService } from './uomconversion.service';
import { UomconversionController } from './uomconversion.controller';
import { UomConversion } from './entities/uomconversion.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { PurchaseReturnLog } from '@modules/purchasereturn/entities/purchasereturnlog.entity';
import { Ingredient } from '@modules/ingredient/entities/ingredient.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UomConversion, UnitsOfMeasure, PurchaseReceiptItem, PurchaseReturnLog, Ingredient, InventoryItem])],
  controllers: [UomconversionController],
  providers: [UomconversionService],
})
export class UomconversionModule { }
