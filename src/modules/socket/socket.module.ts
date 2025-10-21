import { Module } from "@nestjs/common";
import { SocketService } from "./socket.service";
import { KitchenGateway } from "./kitchen.gateway";
import { SocketController } from "./socket.controller";

@Module({
  providers: [SocketService, KitchenGateway],
  controllers: [SocketController],
  exports: [SocketService, KitchenGateway],
})
export class SocketModule {}
