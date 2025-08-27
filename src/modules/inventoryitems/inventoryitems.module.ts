import { Module } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { InventoryitemsController } from './inventoryitems.controller';

@Module({
  controllers: [InventoryitemsController],
  providers: [InventoryitemsService],
})
export class InventoryitemsModule {}
