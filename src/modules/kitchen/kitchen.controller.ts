// src/modules/kitchen/kitchen.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ItemStatus } from 'src/common/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/user.decorator';
@Controller('kitchen')
@UseGuards(JwtAuthGuard)
export class KitchenController {
  constructor(private readonly svc: KitchenService) {}

  @Post('/orders/:orderId/notify-items')
async notifyItems(
  @Param('orderId') orderId: string,
  @Body()
  body: {
    items: { menuItemId: string; delta: number }[];
    priority?: boolean;
    note?: string;
    tableName: string;
    source?: 'cashier' | 'waiter' | 'other';
  },
  @CurrentUser() user: any,   // 👈 dùng decorator giống bên dưới
) {
  const source = body.source ?? 'cashier';

  // ƯU TIÊN: tên đầy đủ / username / name
  const staff =
    user?.profile?.fullName ??
    user?.fullName ??
    user?.username ??
    user?.name ??
    // fallback theo nguồn
    (source === 'waiter' ? 'Phục vụ' : 'Thu ngân');

  return this.svc.notifyItems({
    orderId,
    tableName: body.tableName,   // dùng tableName FE gửi lên
    staff,
    itemsDelta: body.items,
    priority: body.priority,
    note: body.note,
    source,
  });
}


 // src/modules/kitchen/kitchen.controller.ts
@Get('/tickets')
async list(
  @Query('status') status: ItemStatus,
  @Query('page') page = 1,
  @Query('limit') limit = 200,
) {
  // ✅ PHẢI GỌI service đọc ticketRepo, KHÔNG phải orderItemRepo
  return this.svc.listByStatus(status, Number(page), Number(limit));
}


  @Patch('/tickets/status')
  async updateStatus(@Body() body: { ticketIds: string[]; status: ItemStatus }) {
    return this.svc.updateStatusBulk(body.ticketIds, body.status);
  }

  @Get('/orders/:orderId/progress')
async progress(@Param('orderId') orderId: string) {
  return this.svc.getOrderProgress(orderId);
}
 @Get('/orders/:orderId/notify-history')
  async history(@Param('orderId') orderId: string) {
    return this.svc.getNotifyHistory(orderId);
  }





  @UseGuards(JwtAuthGuard)
@Post('/orders/:orderId/cancel-items')
async cancelAfterNotify(
  @Param('orderId') orderId: string,
  @Body() body: { menuItemId: string; qty: number; reason?: string },
  @Req() req: any,
    @CurrentUser() user: any
) {
  const staff = user?.name ?? 'Thu ngân';
  return this.svc.voidTicketsByMenu({
    orderId,
    menuItemId: body.menuItemId,
    qtyToVoid: Number(body.qty),
    by: staff,
    reason: body.reason,
  });
}

@Patch('/tickets/:id/delete')
async deleteCancelled(@Param('id') id: string) {
  // chỉ cho xóa nếu là ticket hủy
  const t = await this.svc['ticketRepo'].findOne({ where: { id } });
  if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
  if (t.status !== ItemStatus.CANCELLED) {
    throw new BadRequestException('ONLY_CANCELLED_TICKET_DELETABLE');
  }
  await this.svc['ticketRepo'].delete(id);
  // (tuỳ chọn) emit sự kiện để FE bếp/cashier/waiter refresh
  this.svc['gw'].server.to('kitchen').emit('kitchen:cancel_ticket_deleted', { id });
  this.svc['gw'].server.to('cashier').emit('kitchen:cancel_ticket_deleted', { id });
  this.svc['gw'].server.to('waiter').emit('kitchen:cancel_ticket_deleted', { id });
  return { ok: true, id };
}

// kitchen.controller.ts

@Patch("tickets/:id/cancel-from-kitchen")
cancelFromKitchen(
  @Param("id") id: string,
  @Body() body: { qtyToVoid?: number; reason?: string },
  @Req() req: any,
) {
  const by = req.user?.id ?? "kitchen";
  return this.svc.cancelFromKitchen({
    ticketId: id,
    qtyToVoid: body.qtyToVoid,
    reason: body.reason,
    by,
  });
}



}
