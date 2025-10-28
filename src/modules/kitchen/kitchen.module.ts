// src/modules/kitchen/kitchen.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KitchenBatch } from './entities/kitchen-batch.entity';
import { KitchenTicket } from './entities/kitchen-ticket.entity';
import { KitchenService } from './kitchen.service';
import { KitchenController } from './kitchen.controller';
import { KitchenGateway } from '../socket/kitchen.gateway';
import { MenuItem } from '../menuitems/entities/menuitem.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KitchenBatch, KitchenTicket, MenuItem])],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenGateway],
  exports: [KitchenService, KitchenGateway],
})
export class KitchenModule {}
