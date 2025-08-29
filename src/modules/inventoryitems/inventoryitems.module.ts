import { Module } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { InventoryitemsController } from './inventoryitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventoryitem.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItem])],
  controllers: [InventoryitemsController],
  providers: [InventoryitemsService],
})
export class InventoryitemsModule { }
