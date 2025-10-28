import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { KitchenGateway } from './kitchen.gateway';
import { OrderItem } from '../orderitems/entities/orderitem.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { ItemStatus } from '../../common/enums';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KitchenBatch } from '../kitchen/entities/kitchen-batch.entity';
import { KitchenTicket } from '../kitchen/entities/kitchen-ticket.entity';
@Injectable()
export class SocketService {
  constructor(
    private readonly gw: KitchenGateway,
    private readonly ds: DataSource,
    @InjectRepository(KitchenBatch) private readonly batchRepo: Repository<KitchenBatch>,
    @InjectRepository(KitchenTicket) private readonly ticketRepo: Repository<KitchenTicket>,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
  ) {}

  async notifyItems(opts: {
    orderId: string;
    tableName: string;
    staff: string;
    itemsDelta: Array<{ menuItemId: string; delta: number }>;
    priority?: boolean;
    note?: string;
  }) {
    const batch = await this.ds.transaction(async em => {
      const b = em.getRepository(KitchenBatch).create({
        order: { id: opts.orderId } as any,
        tableName: opts.tableName,
        staff: opts.staff,
        priority: !!opts.priority,
        note: opts.note ?? null,
      });
      return em.getRepository(KitchenBatch).save(b);
    });

    const lines: Array<{ ticketId: string; name: string; qty: number }> = [];

    await this.ds.transaction(async em => {
      const mRepo = em.getRepository(MenuItem);
      const tRepo = em.getRepository(KitchenTicket);

      for (const { menuItemId, delta } of opts.itemsDelta) {
        const qty = Number(delta) || 0;
        if (qty <= 0) continue;

        const menu = await mRepo.findOneBy({ id: menuItemId });
        if (!menu) continue;

        const t = tRepo.create({
          batch,
          order: { id: opts.orderId } as any,
          menuItem: { id: menuItemId } as any,
          qty,
          status: ItemStatus.PENDING,
        });
        const saved = await tRepo.save(t);
        lines.push({ ticketId: saved.id, name: menu.name, qty });
      }
    });

    // phát socket cho bếp
    this.gw.emitNotifyItemsToKitchen({
      orderId: opts.orderId,
      tableName: opts.tableName,
      batchId: batch.id,
      createdAt: batch.createdAt.toISOString(),
      items: lines.map(l => ({ orderItemId: l.ticketId, name: l.name, qty: l.qty })), // giữ shape FE
      staff: opts.staff,
      priority: opts.priority,
    });

    return { batchId: batch.id, items: lines, createdAt: batch.createdAt };
  }
}

