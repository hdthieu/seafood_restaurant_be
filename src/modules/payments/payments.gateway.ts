// src/modules/payments/payments.gateway.ts
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

type Role = 'cashier' | 'waiter' | 'kitchen';

@WebSocketGateway({
  namespace: '/realtime',
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: '*' },
})
export class PaymentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  /** Lưu vai trò của client để quản lý presence */
  private clientRole = new Map<string, Role>();

  /* ===================== Lifecycle ===================== */
  handleConnection(_client: Socket) {
    // console.log('[realtime] connected', _client.id);
  }

  handleDisconnect(client: Socket) {
    const role = this.clientRole.get(client.id);
    if (role) {
      this.clientRole.delete(client.id);
      this.broadcastPresence(role);
    }
    // console.log('[realtime] disconnected', client.id);
  }

  /* ===================== Room helpers ===================== */
  private safeJoin(client: Socket, room: string) {
    try {
      client.join(room);
    } catch {}
  }
  private safeLeave(client: Socket, room: string) {
    try {
      client.leave(room);
    } catch {}
  }

  /* ===================== Presence ===================== */
  /** Đếm số client đang ở room theo vai trò và phát `presence:<role>` */
  private async broadcastPresence(role: Role) {
    const roomName = role;
    const n = await this.countRoom(roomName);
    this.server.to(roomName).emit(`presence:${role}`, n);
  }

  private async countRoom(room: string): Promise<number> {
    // Socket.IO v4
    const sids = await this.server.in(room).allSockets();
    return sids.size;
  }

  /** FE hỏi số lượng người đang online ở một vai trò */
  @SubscribeMessage('presence:who')
  async presenceWho(
    @MessageBody() role: Role,
    @ConnectedSocket() client: Socket,
  ) {
    if (!role) return;
    const n = await this.countRoom(role);
    client.emit(`presence:${role}`, n);
  }

  /* ===================== Join theo vai trò ===================== */
  /**
   * FE gửi:  { role: 'cashier' | 'waiter' | 'kitchen' }
   * -> client join room tương ứng để nhận broadcast cho vai trò đó
   */
  @SubscribeMessage('room:join')
  joinRole(
    @MessageBody() role: Role,
    @ConnectedSocket() client: Socket,
  ) {
    if (!role) return;
    this.safeJoin(client, role);
    this.clientRole.set(client.id, role);
    this.broadcastPresence(role);
  }

  @SubscribeMessage('room:leave')
  leaveRole(
    @MessageBody() role: Role,
    @ConnectedSocket() client: Socket,
  ) {
    if (!role) return;
    this.safeLeave(client, role);
    this.clientRole.delete(client.id);
    this.broadcastPresence(role);
  }

  /* ===================== Join theo invoice/order/table ===================== */
  // FE sẽ gửi { invoiceId } để join room invoice
  @SubscribeMessage('join_invoice')
  joinInvoice(@MessageBody() data: { invoiceId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.invoiceId) return;
    this.safeJoin(client, data.invoiceId);
  }

  @SubscribeMessage('leave_invoice')
  leaveInvoice(@MessageBody() data: { invoiceId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.invoiceId) return;
    this.safeLeave(client, data.invoiceId);
  }

  // (tuỳ chọn) theo dõi order
  @SubscribeMessage('join_order')
  joinOrder(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.orderId) return;
    this.safeJoin(client, `order:${data.orderId}`);
  }
  @SubscribeMessage('leave_order')
  leaveOrder(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.orderId) return;
    this.safeLeave(client, `order:${data.orderId}`);
  }

  // (tuỳ chọn) theo dõi table
  @SubscribeMessage('join_table')
  joinTable(@MessageBody() data: { tableId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.tableId) return;
    this.safeJoin(client, `table:${data.tableId}`);
  }
  @SubscribeMessage('leave_table')
  leaveTable(@MessageBody() data: { tableId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.tableId) return;
    this.safeLeave(client, `table:${data.tableId}`);
  }

  /* ===================== Emit tiện ích ===================== */
  /** Đã thanh toán đủ */
  emitPaid(
    invoiceId: string,
    payload: {
      invoiceId: string;
      orderId?: string | null;
      tableId?: string | null;
      tableName?: string | null;
      amount?: number;
      method?: string | number;
      paidAt?: string;
    },
  ) {
    // Phát tới những nơi có thể đang lắng nghe
    if (invoiceId) this.server.to(invoiceId).emit('invoice.paid', payload);
    if (payload.orderId) this.server.to(`order:${payload.orderId}`).emit('orders:paid', payload);
    if (payload.tableId) this.server.to(`table:${payload.tableId}`).emit('orders:paid', payload);

    // Vai trò
    this.server.to('cashier').emit('orders:paid', payload);
    this.server.to('waiter').emit('orders:paid', payload);
    // (tuỳ chọn) để bếp clear vé còn lại
    this.server.to('kitchen').emit('orders:paid', payload);
  }

  /** Thanh toán một phần */
  emitPartial(
    invoiceId: string,
    payload: { invoiceId: string; orderId?: string | null; amount: number; remaining: number },
  ) {
    if (invoiceId) this.server.to(invoiceId).emit('invoice.partial', payload);
    if (payload.orderId) this.server.to(`order:${payload.orderId}`).emit('orders:partial_paid', payload);
    this.server.to('cashier').emit('orders:partial_paid', payload);
    this.server.to('waiter').emit('orders:partial_paid', payload);
  }
}
