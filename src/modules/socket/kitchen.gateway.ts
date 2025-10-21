// src/realtime/kitchen.gateway.ts
import {
  WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime-pos',
  path: '/socket.io',
  transports: ['polling', 'websocket'], // allow both
  cors: { origin: '*', methods: ['GET','POST'], credentials: false },
})
export class KitchenGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    // bạn có thể đọc token/restaurantId từ query để join room
    const restaurantId = client.handshake.auth?.restaurantId || client.handshake.query['restaurantId'];
    if (restaurantId) client.join(`rest:${restaurantId}`);
  }

  handleDisconnect() {}

  // Phát “báo bếp”
  emitNotifyItems(payload: {
    restaurantId: string;
    orderId: string;
    tableName: string;
    batchId: string;
    createdAt: string;
    items: Array<{ orderItemId: string; name: string; qty: number }>;
    staff: string;
    priority?: boolean;
  }) {
    this.server.to(`rest:${payload.restaurantId}`).emit('kitchen:notify_items', payload);
  }

  // Phát “huỷ món”
  emitCancelItems(payload: {
    restaurantId: string;
    orderId: string;
    tableName?: string;
    createdAt: string;
    items: Array<{ orderItemId: string; name: string; qty: number; reason: string }>;
    staff: string;
  }) {
    this.server.to(`rest:${payload.restaurantId}`).emit('kitchen:cancel_items', payload);
  }
}
