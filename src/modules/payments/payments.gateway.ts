// src/modules/payments/payments.gateway.ts
import {
  WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect,
  WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime',                 // ws://host/realtime
  cors: { origin: '*', credentials: false },
})
export class PaymentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    // console.log('socket connected', client.id);
  }
  handleDisconnect(client: Socket) {
    // console.log('socket disconnected', client.id);
  }

  // FE sẽ gửi { invoiceId } để join room
  @SubscribeMessage('join_invoice')
  joinInvoice(@MessageBody() data: { invoiceId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.invoiceId) return;
    client.join(data.invoiceId);
  }

  @SubscribeMessage('leave_invoice')
  leaveInvoice(@MessageBody() data: { invoiceId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.invoiceId) return;
    client.leave(data.invoiceId);
  }

  // tiện ích phát sự kiện
  emitPaid(invoiceId: string, payload: any) {
    this.server.to(invoiceId).emit('invoice.paid', payload);
  }
  emitPartial(invoiceId: string, payload: any) {
    this.server.to(invoiceId).emit('invoice.partial', payload);
  }
}
