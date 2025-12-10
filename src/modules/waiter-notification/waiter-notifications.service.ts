// src/modules/waiter-notification/waiter-notifications.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  WaiterNotification,
  WaiterNotificationType,
} from './waiter-notification.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Order } from 'src/modules/order/entities/order.entity';

@Injectable()
export class WaiterNotificationsService {
  constructor(
    @InjectRepository(WaiterNotification)
    private readonly notifRepo: Repository<WaiterNotification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}
async createOrderCancelled(input: {
  waiterId: string;
  order: Order;
  title?: string;
  message?: string;       
  reason?: string;
  by?: string;            
}) {
  const waiter = await this.userRepo.findOne({
    where: { id: input.waiterId },
  });
  if (!waiter) throw new NotFoundException('WAITER_NOT_FOUND');

  const title = input.title ?? 'Món trong đơn đã bị huỷ';

  const byLabel =
    input.by === 'kitchen'
      ? 'Bếp'
      : input.by === 'cashier'
      ? 'Thu ngân'
      : input.by
      ? input.by
      : 'Hệ thống';

  const msgFromCaller = input.message?.trim();

  let finalMessage: string;

  if (msgFromCaller && msgFromCaller.length > 0) {
    // 👉 ĐÃ có message đầy đủ (bao gồm lý do, qty, món...) thì dùng luôn
    finalMessage = msgFromCaller;
  } else {
    // 👉 Không truyền message thì mình tự build đơn giản
    const extraReason = input.reason ? `\nLý do: ${input.reason}` : '';
    finalMessage = `Bởi: ${byLabel}${extraReason}`;
  }

  const noti = this.notifRepo.create({
    waiter,
    order: input.order ?? null,
    type: WaiterNotificationType.ORDER_CANCELLED,
    title,
    message: finalMessage,
    read: false,
  });

  return this.notifRepo.save(noti);
}


  // =========================
  // 🔻 Các hàm KHỚP với controller
  // =========================

  /** GET /waiter-notifications/me */
  async findMyNotifications(waiterId: string) {
    const rows = await this.notifRepo
      .createQueryBuilder('n')
      .leftJoin('n.order', 'o')
      .leftJoin('o.table', 't')
      .where('n.waiterId = :wid', { wid: waiterId })
      .orderBy('n.createdAt', 'DESC')
      .select([
        'n.id AS id',
        'n.title AS title',
        'n.message AS message',
        'n.createdAt AS createdAt',
        'n.read AS read',
        'o.id AS orderId',
        't.name AS tableName',
      ])
      .getRawMany<{
        id: string;
        title: string;
        message: string | null;
        createdAt: Date;
        read: boolean;
        orderId: string | null;
        tableName: string | null;
      }>();

    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId ?? '',
      tableName: r.tableName,
      title: r.title,
      message: r.message ?? '',
      createdAt: r.createdAt.toISOString(),
      read: r.read,
      // reason/by không có trường riêng trong DB -> để undefined
    }));
  }

  /** GET /waiter-notifications/me/unread-count */
  async unreadCount(waiterId: string) {
    return this.notifRepo.count({
      where: {
        waiter: { id: waiterId },
        read: false,
      },
    });
  }

  /** PATCH /waiter-notifications/:id/read */
  async markAsRead(id: string, waiterId: string) {
    const noti = await this.notifRepo.findOne({
      where: { id },
      relations: ['waiter'],
    });

    if (!noti) {
      throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    }

    // đảm bảo không đọc noti của người khác
    if (noti.waiter.id !== waiterId) {
      throw new ForbiddenException('NOT_YOUR_NOTIFICATION');
    }

    if (!noti.read) {
      noti.read = true;
      noti.readAt = new Date();
      await this.notifRepo.save(noti);
    }

    return { success: true };
  }

  /** Dùng cho /read-many (nếu có) */
  async markManyAsRead(ids: string[], waiterId: string) {
    if (!ids?.length) return { updated: 0 };

    const rows = await this.notifRepo.find({
      where: {
        id: In(ids),
        waiter: { id: waiterId },
      },
    });

    if (!rows.length) return { updated: 0 };

    const now = new Date();
    rows.forEach((n) => {
      if (!n.read) {
        n.read = true;
        n.readAt = now;
      }
    });

    await this.notifRepo.save(rows);
    return { updated: rows.length };
  }

  // =========================
  // 🔻 Giữ lại HÀM CŨ để không gãy chỗ khác
  // =========================

  /** alias cũ ⇢ mới */
  async listForWaiter(waiterId: string) {
    return this.findMyNotifications(waiterId);
  }

  async markRead(id: string) {
    // không biết waiterId nên không check owner, chỉ dùng nếu gọi nội bộ
    await this.notifRepo.update(
      { id },
      { read: true, readAt: new Date() },
    );
  }

  async markManyRead(ids: string[]) {
    if (!ids?.length) return;
    await this.notifRepo.update(
      { id: In(ids) },
      { read: true, readAt: new Date() },
    );
  }
}
