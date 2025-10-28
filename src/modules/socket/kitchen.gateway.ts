import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket, Namespace } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime-pos',
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: '*', credentials: false },
})
export class KitchenGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server; // server trong trường hợp có namespace là đối tượng của namespace đó

  /** 🔹 Phát sự kiện thông báo số lượng bếp online */
  private broadcastKitchenPresence(nsp: Namespace) {
    try {
      const count = nsp.adapter.rooms.get('kitchen')?.size ?? 0;
      nsp.emit('presence:kitchen', count);
    } catch (e) {
      console.error('[KitchenGateway] broadcastKitchenPresence failed:', e);
    }
  }

  /** 🔹 Khi client kết nối */
  handleConnection(@ConnectedSocket() client: Socket) {
    console.log('[ws] Client connected:', client.id);
    this.broadcastKitchenPresence(client.nsp);
  }

  /** 🔹 Khi client ngắt kết nối */
  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log('[ws] Client disconnected:', client.id);
    this.broadcastKitchenPresence(client.nsp);
  }

  /** 🔹 Client join room (VD: "kitchen" hoặc "cashier") */
  @SubscribeMessage('room:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    if (typeof room === 'string' && room.trim()) {
      client.join(room);
      client.emit('room:joined', room);
      console.log(`[ws] ${client.id} joined room: ${room}`);

      if (room === 'kitchen') this.broadcastKitchenPresence(client.nsp);
    }
  }

  /** 🔹 Client hỏi số lượng bếp online */
  @SubscribeMessage('presence:who')
  handlePresenceWho(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    const nsp = client.nsp;
    const count = nsp.adapter.rooms.get(room)?.size ?? 0;
    client.emit(`presence:${room}`, count);
  }

  /** 🔹 Thu ngân → Phát món mới cho bếp */
  emitNotifyItemsToKitchen(payload: {
    orderId: string;
    tableName: string;
    batchId: string;
    createdAt: string;
    items: Array<{ orderItemId: string; name: string; qty: number }>;
    staff: string;
    priority?: boolean;
  }) {
    // this.server lúc này CHÍNH LÀ namespace '/realtime-pos'
    console.log('[ws] Emitting cashier:notify_items => kitchen', payload);
    this.server.to('kitchen').emit('cashier:notify_items', payload);
  }

  /** 🔹 Thu ngân → Bếp: huỷ món */
  emitCancelItemsToKitchen(payload: {
    orderId: string;
    tableName?: string;
    createdAt: string;
    items: Array<{ orderItemId: string; name: string; qty: number; reason: string }>;
    staff: string;
  }) {
    console.log('[ws] Emitting cashier:cancel_items => kitchen', payload);
    this.server.to('kitchen').emit('cashier:cancel_items', payload);
  }

  /** 🔹 Bếp phản hồi đã nhận */
  @SubscribeMessage('kitchen:ack')
  handleAck(@ConnectedSocket() client: Socket, @MessageBody() data: { batchId: string }) {
    console.log(`[ws] Kitchen ACK from ${client.id}`, data);
    // broadcast cho thu ngân (room 'cashier' nếu có)
    client.nsp.to('cashier').emit('kitchen:ack', data);
  }
}
