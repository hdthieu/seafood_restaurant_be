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
import { ItemStatus } from '../../common/enums';
export type KitchenNotifyItem = {
  ticketId?: string;          // có nếu bạn tạo thực thể ticket riêng
  orderItemId?: string;       // có nếu phát theo row OrderItem
  menuItemId: string;
  name: string;
  qty: number;
};

export type TicketChangeItem = {
  ticketId?: string;
  menuItemId: string;
  qty: number;
  fromStatus: ItemStatus;     // ⚠ dùng enum, không dùng string literal
  toStatus: ItemStatus;
  reason?: string | null;     // cho phép null
};

export type TicketsVoidedPayload = {
  orderId: string;
  tableName?: string;
  by?: string | null;
  // ❶ case cũ: hủy theo id các ticket
  ticketIds?: string[];
  // ❷ case mới: hủy theo tổng qty của từng món
  items?: Array<{ menuItemId: string; qty: number; reason?: string | null; by?: string | null }>;
};

export type NotifyItemsToKitchenPayload = {
  orderId: string;
  tableName?: string;
  batchId?: string;
  createdAt?: string;
  items: KitchenNotifyItem[];
  staff?: string;
  priority?: boolean;
};
@WebSocketGateway({
  namespace: '/realtime-pos',
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: '*', credentials: false },
})
export class KitchenGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server; // server trong trường hợp có namespace là đối tượng của namespace đó


  // socket cho order thay đổi
  emitOrderChanged(payload: {
    orderId: string;
    tableId: string;
   reason:
    | 'CREATED'
    | 'ITEMS_ADDED'
    | 'ITEM_QTY_SET'
    | 'ITEM_REMOVED'
    | 'ORDER_STATUS'
    | 'ORDER_CANCELLED'
    | 'MERGED'
    | 'SPLIT';
  }) {
    // Gửi cho cashier & waiter (để cả 2 phía đồng bộ)
    this.server.to('cashier').emit('orders:changed', payload);
    this.server.to('waiter').emit('orders:changed', payload);
  }
   emitOrdersMerged(payload: { fromOrderId: string; toOrderId: string; fromTableId?: string | null; toTableId?: string | null }) {
    this.server.to('cashier').emit('orders:merged', payload);
    this.server.to('waiter').emit('orders:merged', payload);
  }

  emitOrdersSplit(payload: { fromOrderId: string; toOrderId: string }) {
    this.server.to('cashier').emit('orders:split', payload);
    this.server.to('waiter').emit('orders:split', payload);
  }





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
   emitNotifyItemsToKitchen(payload: NotifyItemsToKitchenPayload) {
    // this.server lúc này CHÍNH LÀ namespace '/realtime-pos'
    console.log('[ws] Emitting cashier:notify_items => kitchen', payload);
    this.server.to('kitchen').emit('cashier:notify_items', payload);
     this.server.to('waiter').emit('kitchen:new_batch', payload);
  this.server.to('cashier').emit('kitchen:new_batch', payload);
  }

  /** 🔹 Thu ngân → Bếp: huỷ món */
  emitCancelItemsToKitchen(payload: {
    orderId: string;
    tableName?: string;
    createdAt: string;
    items: Array<{ orderItemId: string; name: string; qty: number; reason: string }>;
    staff: string;
     priority?: boolean;
  }) {
    console.log('[ws] Emitting cashier:cancel_items => kitchen', payload);
    this.server.to('kitchen').emit('cashier:cancel_items', payload);

     // 🔸 Gửi lại cho waiter và cashier để đồng bộ “đã báo bếp”
   this.server.to('cashier').emit('kitchen:items_cancelled', payload);
this.server.to('waiter').emit('kitchen:items_cancelled', payload);








    










  }



  emitTicketStatusChanged(payload: {
    orderId: string;
    items: TicketChangeItem[]
  }) {
    this.server.to('kitchen').emit('kitchen:ticket_status_changed', payload);
     this.server.to('cashier').emit('kitchen:ticket_status_changed', payload);
  this.server.to('waiter').emit('kitchen:ticket_status_changed', payload);
  }

  // Nếu muốn phân biệt event hủy riêng:
   emitTicketsVoided(payload: TicketsVoidedPayload)  {
    this.server.to('kitchen').emit('kitchen:tickets_voided', payload);
     this.server.to('cashier').emit('kitchen:tickets_voided', payload);
  this.server.to('waiter').emit('kitchen:tickets_voided', payload);
  }


/** 🔹 Emit huỷ món chuẩn (phân biệt thu ngân / bếp) */
emitVoidSynced(payload: {
  orderId: string;
  menuItemId: string;
  qty: number;
  reason?: string | null;
  by: "cashier" | "kitchen";
}) {
  if (payload.by === "cashier") {
    // 👉 Thu ngân hủy → CHỈ BÁO CHO BẾP
    this.server.to("kitchen").emit("kitchen:void_synced", payload);

    // 👉 Và đồng bộ UI cho chính thu ngân (không hiển thị toast bếp hủy)
    this.server.to("cashier").emit("cashier:void_local", payload);
  } else {
    // 👉 Bếp hủy → Chỉ thu ngân nhận
    this.server.to("cashier").emit("kitchen:void_synced", payload);
  }
}



  emitOrderMetaUpdated(payload: {
    orderId: string;
    tableId: string;
    guestCount: number | null;
    customer: { id: string; name: string; phone?: string | null } | null;
  }) {
    // Gửi cho thu ngân + phục vụ
    this.server.to('cashier').emit('orders:meta_updated', payload);
    this.server.to('waiter').emit('orders:meta_updated', payload);

    // Nếu có join room theo order / table thì bắn thêm
    if (payload.orderId) {
      this.server.to(`order:${payload.orderId}`).emit('orders:meta_updated', payload);
    }
    if (payload.tableId) {
      this.server.to(`table:${payload.tableId}`).emit('orders:meta_updated', payload);
    }
  }



  /** 🔹 Bếp phản hồi đã nhận */
  @SubscribeMessage('kitchen:ack')
  handleAck(@ConnectedSocket() client: Socket, @MessageBody() data: { batchId: string }) {
    console.log(`[ws] Kitchen ACK from ${client.id}`, data);
    // broadcast cho thu ngân (room 'cashier' nếu có)
    client.nsp.to('cashier').emit('kitchen:ack', data);
  }



  
}
