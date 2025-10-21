// src/orders/orders.controller.ts
import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { SocketService } from './socket.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { BadRequestException } from '@nestjs/common';
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
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) throw new BadRequestException('restaurantId missing on user');
    const staff = req.user?.name ?? 'Thu ngân';
    const tableName = 'Bàn ?';

    return this.svc.notifyItems({
      restaurantId,
      orderId,
      tableName,
      staff,
      itemsDelta: body.items,
      priority: body.priority,
    });
  }

  @Patch('/orderitems/cancel')
  async cancelItems(
    @Body() body: { itemIds: string[]; reason: string },
    @Req() req: any,
  ) {
    // map itemIds -> (orderId, name, qty) trong DB rồi gọi service
    const restaurantId = req.user.restaurantId;
    const staff = req.user.name ?? 'Thu ngân';
    const orderId = '...'; // tìm từ itemIds

    return this.svc.cancelItems({
      restaurantId,
      orderId,
      staff,
      items: body.itemIds.map((id) => ({ orderItemId: id, reason: body.reason })),
    });
  }
}
