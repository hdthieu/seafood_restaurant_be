// src/modules/kitchen/kitchen.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ItemStatus } from 'src/common/enums';

@Controller('kitchen')
@UseGuards(JwtAuthGuard)
export class KitchenController {
  constructor(private readonly svc: KitchenService) {}

  @Post('/orders/:orderId/notify-items')
  async notifyItems(
    @Param('orderId') orderId: string,
    @Body() body: { items: { menuItemId: string; delta: number }[]; priority?: boolean; note?: string, tableName: string },
    @Req() req: any,
  ) {
    const staff = req.user?.name ?? 'Thu ngân';
    const tableName = 'Bàn ?'; // TODO: lấy từ DB theo orderId
    return this.svc.notifyItems({
      orderId,
       tableName: body.tableName,  
      staff,
      itemsDelta: body.items,
      priority: body.priority,
      note: body.note,
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
}
