import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SocketService } from './socket.service';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller()
export class SocketController {
  constructor(private readonly svc: SocketService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/orders/:orderId/notify-items')
  async notifyItems(
    @Param('orderId') orderId: string,
    @Body() body: { items: { menuItemId: string; delta: number }[]; priority?: boolean },
    @Req() req: any,
  ) {
    console.log('[notify-items] incoming:', JSON.stringify(body));
    const staff = req.user?.name ?? 'Thu ngân';   // dùng JWT name
    const tableName = 'Bàn ?';                    // TODO: đọc từ DB theo orderId

    return this.svc.notifyItems({
      orderId,
      tableName,
      staff,
      itemsDelta: body.items,
      priority: body.priority,
    });
  }

  // @UseGuards(JwtAuthGuard)
  // @Patch('/orderitems/cancel')
  // async cancelItems(
  //   @Body() body: { itemIds: string[]; reason: string },
  //   @Req() req: any,
  // ) {
  //   const staff = req.user?.name ?? 'Thu ngân';

  //   // TODO: map itemIds -> { orderId, name, qty } từ DB
  //   const orderId = '...'; // tìm từ itemIds

  //   return this.svc.cancelItems({
  //     orderId,
  //     staff,
  //     items: body.itemIds.map(id => ({ orderItemId: id, reason: body.reason })),
  //   });
  // }
}
