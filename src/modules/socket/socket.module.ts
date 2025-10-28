import { Module } from "@nestjs/common";
import { SocketService } from "./socket.service";
import { KitchenGateway } from "./kitchen.gateway";
import { SocketController } from "./socket.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KitchenBatch } from "../kitchen/entities/kitchen-batch.entity";
import { KitchenTicket } from "../kitchen/entities/kitchen-ticket.entity";
import { MenuItem } from '../menuitems/entities/menuitem.entity';
@Module({
  imports: [TypeOrmModule.forFeature([KitchenBatch, KitchenTicket, MenuItem])],
  providers: [SocketService, KitchenGateway],
  controllers: [SocketController],
  exports: [SocketService, KitchenGateway],
})
export class SocketModule {}
