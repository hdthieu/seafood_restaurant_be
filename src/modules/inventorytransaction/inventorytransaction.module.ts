import { Module } from '@nestjs/common';
import { InventorytransactionService } from './inventorytransaction.service';
import { InventorytransactionController } from './inventorytransaction.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryTransaction } from './entities/inventorytransaction.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryTransaction,
      InventoryItem,
      Supplier,
    ]),
  ],
  controllers: [InventorytransactionController],
  providers: [InventorytransactionService],
})
export class InventorytransactionModule { }
