import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WaiterNotification,
  WaiterNotificationType,
} from './waiter-notification.entity';
import { Order } from 'src/modules/order/entities/order.entity';

@Injectable()
export class WaiterNotificationsService {
  constructor(
    @InjectRepository(WaiterNotification)
    private readonly repo: Repository<WaiterNotification>,
  ) {}

  async createOrderCancelled(opts: {
    waiterId: string;
    order: Order;
    reason?: string;
    by?: string;
  }) {
    const title = `Đơn của bạn đã bị huỷ`;
    const msgParts: string[] = [];

    if (opts.order?.table?.name) {
      msgParts.push(`Bàn ${opts.order.table.name}`);
    }
    if (opts.by) {
      msgParts.push(`Bởi: ${opts.by}`);
    }
    if (opts.reason) {
      msgParts.push(`Lý do: ${opts.reason}`);
    }

    const n = this.repo.create({
      waiter: { id: opts.waiterId } as any,
      order: { id: opts.order.id } as any,
      type: WaiterNotificationType.ORDER_CANCELLED,
      title,
      message: msgParts.join(' · '),
    });

    return this.repo.save(n);
  }

  async findMyNotifications(waiterId: string) {
    return this.repo.find({
      where: { waiter: { id: waiterId } as any },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: string, waiterId: string) {
    const n = await this.repo.findOne({
      where: { id, waiter: { id: waiterId } as any },
    });
    if (!n) throw new NotFoundException('NOTIFICATION_NOT_FOUND');

    if (!n.read) {
      n.read = true;
      n.readAt = new Date();
      await this.repo.save(n);
    }

    return n;
  }

  async unreadCount(waiterId: string) {
    const count = await this.repo.count({
      where: { waiter: { id: waiterId } as any, read: false },
    });
    return { count };
  }
}
