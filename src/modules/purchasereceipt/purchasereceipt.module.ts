import { Module } from '@nestjs/common';
import { PurchasereceiptService } from './purchasereceipt.service';
import { PurchasereceiptController } from './purchasereceipt.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseReceipt } from './entities/purchasereceipt.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PurchaseReceipt, PurchaseReceiptItem, InventoryItem, InventoryTransaction,
    Supplier])],
  controllers: [PurchasereceiptController],
  providers: [PurchasereceiptService],
})
export class PurchasereceiptModule { }
