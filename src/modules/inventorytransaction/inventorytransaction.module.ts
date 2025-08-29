import { Module } from '@nestjs/common';
import { InventorytransactionService } from './inventorytransaction.service';
import { InventorytransactionController } from './inventorytransaction.controller';

@Module({
  controllers: [InventorytransactionController],
  providers: [InventorytransactionService],
})
export class InventorytransactionModule {}
