// src/modules/kitchen/kitchen.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { KitchenBatch } from './entities/kitchen-batch.entity';
import { KitchenTicket } from './entities/kitchen-ticket.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { KitchenGateway } from '../socket/kitchen.gateway';
import { ItemStatus } from 'src/common/enums';


// thông báo ngược lại bếp 
 type ProgressRow = {
  menuItemId: string;
  name: string;
  notified: number;   // tổng đã báo bếp (mọi trạng thái)
  preparing: number;
  ready: number;
  served: number;
  cooked: number;     // = ready + served
};
type BatchItemDTO = { menuItemId: string; name: string; qty: number };
export type NotifyBatchDTO = {
  id: string;
  createdAt: string;
  staff: string;
  tableName: string;
  note: string | null;
  priority: boolean;
  items: BatchItemDTO[];
};

@Injectable()
export class KitchenService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(KitchenBatch) private readonly batchRepo: Repository<KitchenBatch>,
    @InjectRepository(KitchenTicket) private readonly ticketRepo: Repository<KitchenTicket>,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
    private readonly gw: KitchenGateway,
  ) {}

  async notifyItems(payload: {
    orderId: string;
    tableName: string;
    staff: string;
    itemsDelta: Array<{ menuItemId: string; delta: number }>;
    priority?: boolean;
    note?: string;
  }) {
    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        order: { id: payload.orderId } as any,
        tableName: payload.tableName,
        staff: payload.staff,
        priority: !!payload.priority,
        note: payload.note ?? null,
      }),
    );

    const menuIds = payload.itemsDelta.filter(d => d.delta > 0).map(d => d.menuItemId);
    const menus = await this.menuRepo.find({ where: { id: In(menuIds) } });
    const nameMap = new Map(menus.map(m => [m.id, m.name]));

    const tickets: KitchenTicket[] = [];
    for (const { menuItemId, delta } of payload.itemsDelta) {
      const qty = Number(delta) || 0;
      if (qty <= 0) continue;
      if (!nameMap.has(menuItemId)) continue;

      tickets.push(
        this.ticketRepo.create({
          batch,
          order: { id: payload.orderId } as any,
          menuItem: { id: menuItemId } as any,
          qty,
          status: ItemStatus.PENDING,
        }),
      );
    }
    const saved = await this.ticketRepo.save(tickets);

    // phát socket theo shape cũ (id field vẫn là orderItemId cho FE khỏi đổi)
    this.gw.emitNotifyItemsToKitchen({
      orderId: payload.orderId,
      tableName: batch.tableName,
      batchId: batch.id,
      createdAt: batch.createdAt.toISOString(),
      items: saved.map(t => ({
        orderItemId: t.id, // thực chất là ticketId
        name: nameMap.get(t.menuItem.id) || '',
        qty: t.qty,
      })),
      staff: payload.staff,
      priority: payload.priority,
    });

    return { batchId: batch.id, items: saved.map(s => ({ ticketId: s.id, qty: s.qty })), createdAt: batch.createdAt };
  }

 // src/modules/kitchen/kitchen.service.ts
async listByStatus(status: ItemStatus, page = 1, limit = 200) {
  const [rows, total] = await this.ticketRepo.findAndCount({
    where: { status },
    order: { createdAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
  });

  // ✅ map về shape FE đang dùng
  return {
    data: rows.map(r => ({
      id: r.id,                              // = ticketId
      quantity: r.qty,                       // = delta lần gửi
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      batchId: r.batch.id,
      menuItem: { id: r.menuItem.id, name: r.menuItem.name },
      order: { id: r.order.id, table: { id: '', name: r.batch.tableName } },
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}


  async updateStatusBulk(ticketIds: string[], to: ItemStatus) {
  const rows = await this.ticketRepo.findBy({ id: In(ticketIds) });
  if (rows.length === 0) throw new NotFoundException('TICKETS_NOT_FOUND');

  // chụp lại trạng thái cũ trước khi đổi
  const before = rows.map(r => ({
    orderId:   r.order.id,
    ticketId:  r.id,
    menuItemId:r.menuItem.id,
    qty:       r.qty,
    fromStatus:r.status,        // 👈
  }));

  // đổi trạng thái
  rows.forEach(r => (r.status = to));
  await this.ticketRepo.save(rows);

  // phát socket: gửi cả fromStatus & toStatus
  this.gw.server.to('cashier').emit('kitchen:ticket_status_changed', {
    items: before.map(b => ({
      ...b,
      toStatus: to,            // 👈
    })),
  });

  return { status: to, updated: rows.map(r => r.id) };
}

  // thông báo ngược lại cho FE khi có thay đổi trạng thái từ bếp
 

async getOrderProgress(orderId: string): Promise<ProgressRow[]> {
  // group by (menuItemId, status)
  const raw = await this.ticketRepo
    .createQueryBuilder('t')
    .leftJoin('t.menuItem', 'mi')
    .select('t.menuItemId', 'menuItemId')
    .addSelect('mi.name', 'name')
    .addSelect('t.status', 'status')
    .addSelect('SUM(t.qty)', 'qty')
    .where('t.orderId = :oid', { oid: orderId })
    .groupBy('t.menuItemId')
    .addGroupBy('mi.name')
    .addGroupBy('t.status')
    .getRawMany<{ menuItemId: string; name: string; status: ItemStatus; qty: string }>();

  // fold thành per menuItemId
  const map = new Map<string, ProgressRow>();
  for (const r of raw) {
    const row = map.get(r.menuItemId) ?? {
      menuItemId: r.menuItemId, name: r.name,
      notified: 0, preparing: 0, ready: 0, served: 0, cooked: 0,
    };
    const q = Number(r.qty) || 0;
    row.notified += q;
    if (r.status === ItemStatus.PREPARING) row.preparing += q;
    if (r.status === ItemStatus.READY)     row.ready     += q;
    if (r.status === ItemStatus.SERVED)    row.served    += q;
    row.cooked = row.ready + row.served;
    map.set(r.menuItemId, row);
  }
  return Array.from(map.values());
}

async getNotifyHistory(orderId: string): Promise<NotifyBatchDTO[]> {
    // 1 query gộp theo batch + menuItem
    const raw = await this.ticketRepo
      .createQueryBuilder('t')
      .innerJoin('t.batch', 'b')
      .innerJoin('t.menuItem', 'mi')
      .select('b.id', 'batchId')
      .addSelect('b.createdAt', 'createdAt')
      .addSelect('b.staff', 'staff')
      .addSelect('b.tableName', 'tableName')
      .addSelect('b.priority', 'priority')
      .addSelect('b.note', 'note')
      .addSelect('mi.id', 'menuItemId')
      .addSelect('mi.name', 'name')
      .addSelect('SUM(t.qty)', 'qty')
      .where('b.orderId = :oid', { oid: orderId })
      .groupBy('b.id')
      .addGroupBy('b.createdAt')
      .addGroupBy('b.staff')
      .addGroupBy('b.tableName')
      .addGroupBy('b.priority')
      .addGroupBy('b.note')
      .addGroupBy('mi.id')
      .addGroupBy('mi.name')
      .orderBy('b.createdAt', 'DESC')
      .getRawMany<{
        batchId: string; createdAt: Date; staff: string; tableName: string;
        priority: boolean; note: string | null; menuItemId: string; name: string; qty: string;
      }>();

    // fold theo batchId
    const map = new Map<string, NotifyBatchDTO>();
    for (const r of raw) {
      const b = map.get(r.batchId) ?? {
        id: r.batchId,
        createdAt: new Date(r.createdAt).toISOString(),
        staff: r.staff,
        tableName: r.tableName,
        note: r.note,
        priority: r.priority,
        items: [],
      };
      b.items.push({ menuItemId: r.menuItemId, name: r.name, qty: Number(r.qty) || 0 });
      map.set(r.batchId, b);
    }
    return Array.from(map.values());
  }
}
