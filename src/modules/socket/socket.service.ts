// src/orders/orders-realtime.service.ts
import { Injectable } from '@nestjs/common';
import { KitchenGateway } from './kitchen.gateway';
import { randomUUID } from 'crypto';

@Injectable()
export class SocketService {
  constructor(private readonly gw: KitchenGateway) {}

  async notifyItems(opts: {
    restaurantId: string;
    orderId: string;
    tableName: string;
    staff: string;
    itemsDelta: Array<{ menuItemId: string; delta: number }>;
    priority?: boolean;
  }) {
    // 1) Đọc order + items hiện tại từ DB
    // 2) Với mỗi delta:
    //    - Nếu tồn tại dòng PENDING/CONFIRMED của menuItem đó => tăng qty
    //    - Nếu dòng đã READY/SERVED/CANCELLED => tạo NEW row PENDING (qty = delta)
    // 3) Lưu DB, gom các dòng hợp lệ thành `lines` để emit

    const batchId = randomUUID();
    const createdAt = new Date().toISOString();

    // giả sử sau khi xử lý, bạn thu được:
    const lines: Array<{ orderItemId: string; name: string; qty: number }> = [
      // ... từ DB thực
    ];

    // 4) Emit socket
    this.gw.emitNotifyItems({
      restaurantId: opts.restaurantId,
      orderId: opts.orderId,
      tableName: opts.tableName,
      batchId,
      createdAt,
      items: lines,
      staff: opts.staff,
      priority: opts.priority,
    });

    return { batchId, items: lines, createdAt };
  }

  async cancelItems(opts: {
    restaurantId: string;
    orderId: string;
    staff: string;
    items: Array<{ orderItemId: string; reason: string }>;
  }) {
    // 1) Update DB: đổi status các item => CANCELLED, ghi reason
    // 2) Gom thông tin để emit

    const createdAt = new Date().toISOString();

    const lines: Array<{ orderItemId: string; name: string; qty: number; reason: string }> = [
      // ... từ DB thực
    ];

    this.gw.emitCancelItems({
      restaurantId: opts.restaurantId,
      orderId: opts.orderId,
      createdAt,
      items: lines,
      staff: opts.staff,
    });

    return { createdAt, items: lines };
  }
}
