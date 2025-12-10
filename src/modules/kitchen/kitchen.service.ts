// src/modules/kitchen/kitchen.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { KitchenBatch } from './entities/kitchen-batch.entity';
import { KitchenTicket } from './entities/kitchen-ticket.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { KitchenGateway } from '../socket/kitchen.gateway';
import { ItemStatus } from 'src/common/enums';
import { BadRequestException } from '@nestjs/common';
import { OrderItem } from '@modules/orderitems/entities/orderitem.entity';
import { OrderItemsService } from '@modules/orderitems/orderitems.service';
import { forwardRef } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { WaiterNotificationsService } from 'src/modules/waiter-notification/waiter-notifications.service';
import { Order } from 'src/modules/order/entities/order.entity';
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
type KitchenVoidPayload = {
  orderId: string;
  menuItemId: string;
  orderItemId: string | null;
  qty: number;
  reason?: string;
  by?: string;
  ticketId: string;
};
const LIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const;
@Injectable()
export class KitchenService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(KitchenBatch) private readonly batchRepo: Repository<KitchenBatch>,
    @InjectRepository(KitchenTicket) private readonly ticketRepo: Repository<KitchenTicket>,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
      @InjectRepository(Order) private readonly orderRepo: Repository<Order>, 
    private readonly gw: KitchenGateway,
    @Inject(forwardRef(() => OrderItemsService))
    private readonly orderItemsSvc: OrderItemsService,
    private readonly dataSource: DataSource,
     private readonly waiterNotifSvc: WaiterNotificationsService, 
  ) { }
private async notifyWaiterOrderCancelled(opts: {
  orderId: string;
  reason?: string;
  by?: string;
}) {
  const order = await this.orderRepo.findOne({
    where: { id: opts.orderId },
    relations: ['createdBy', 'table'],
  });

  if (!order?.createdBy?.id) return;

  const waiterId = order.createdBy.id;

  const noti = await this.waiterNotifSvc.createOrderCancelled({
    waiterId,
    order,
    reason: opts.reason,
    by: opts.by,
  });

  const payload = {
    id: noti.id,
    orderId: order.id,
    tableName: order.table?.name ?? null,
    title: noti.title,
    message: noti.message,
    createdAt: noti.createdAt,
    reason: opts.reason,
    by: opts.by,
    waiterId, // 👈 để gateway biết room riêng
  };

  // ✅ gọi helper vừa thêm
  this.gw.emitWaiterOrderCancelled(payload);
}



  async notifyItems(payload: {
    orderId: string;
    tableName: string;
    staff: string;
    itemsDelta: Array<{ menuItemId: string; delta: number }>;
    priority?: boolean;
    note?: string;
    source?: "cashier" | "waiter" | "other";
  }) {
     const priority = !!payload.priority;   
    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        order: { id: payload.orderId } as any,
        tableName: payload.tableName,
        staff: payload.staff,
          priority,     
        note: payload.note ?? null,

      }),
    );

    const menuIds = payload.itemsDelta.filter(d => d.delta > 0).map(d => d.menuItemId);
    const menus = await this.menuRepo.find({ where: { id: In(menuIds) } });
    const nameMap = new Map(menus.map(m => [m.id, m.name]));
    // lấy orderItems của order đó theo menuItemId
    const orderItems = await this.orderItemRepo.find({
      where: { order: { id: payload.orderId } },
      relations: ['menuItem'],
    });
   const orderItemMap = new Map<
  string,
  { id: string; note: string | null }
>(
  orderItems.map((oi) => [
    oi.menuItem.id,
    { id: oi.id, note: oi.note ?? null },
  ]),
);
    const tickets: KitchenTicket[] = [];
    for (const { menuItemId, delta } of payload.itemsDelta) {
      const qty = Number(delta) || 0;
      if (qty <= 0) continue;
      if (!nameMap.has(menuItemId)) continue;

   const oi = orderItemMap.get(menuItemId) ?? null;

  tickets.push(
    this.ticketRepo.create({
      batch,
      order: { id: payload.orderId } as any,
      menuItem: { id: menuItemId } as any,
      qty,
      status: ItemStatus.PENDING,
      orderItemId: oi?.id ?? null,
      note: oi?.note ?? null,   
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
        ticketId: t.id,                                 //  id của KitchenTicket
        // orderItemId: t.orderItemId ?? undefined,     // (nếu có thì gửi thêm, không thì bỏ)
        menuItemId: t.menuItem?.id                      //  bắt buộc theo KitchenNotifyItem
          ?? (t as any).menuItemId            // (fallback nếu entity có cột FK)
          ?? '',
        name: nameMap.get(
          t.menuItem?.id ?? (t as any).menuItemId ?? ''
        ) || '',
        qty: t.qty,
        orderItemId: t.orderItemId ?? undefined,
      })),

      staff: payload.staff,
       priority, 
       note: payload.note ?? null,
    source: payload.source ?? "cashier", 
    });

    return { batchId: batch.id, items: saved.map(s => ({ ticketId: s.id, qty: s.qty })), createdAt: batch.createdAt };
  }


 async listByStatus(status: ItemStatus, page = 1, limit = 200) {
  const qb = this.ticketRepo
    .createQueryBuilder('kt')
    .innerJoinAndSelect('kt.order', 'o')
    .leftJoinAndSelect('o.table', 'tbl')
    .innerJoinAndSelect('kt.menuItem', 'mi')
    .leftJoinAndSelect('kt.batch', 'b') // đã join batch
    .where('kt.status = :st', { st: status })
    .addOrderBy('kt.createdAt', 'DESC')
    .addOrderBy('kt.id', 'ASC')
    .skip((page - 1) * limit)
    .take(limit);

  const [rows, total] = await qb.getManyAndCount();

  const data = rows.map((t) => ({
    id: t.id,
    orderItemId: t.orderItemId ?? null,
    quantity: t.qty,
    status: t.status,
    createdAt: t.createdAt,
    menuItem: { id: t.menuItem.id, name: t.menuItem.name },
    order: {
      id: t.order.id,
      table: t.order.table
        ? { id: t.order.table.id, name: t.order.table.name }
        : null,
    },
    note: (t as any).note ?? null,

    // 🔥 THÊM 3 DÒNG NÀY (tuỳ bạn dùng hết hay không)
    batchId: t.batch?.id ?? null,
    batchNote: t.batch?.note ?? null,
    priority: t.batch?.priority ?? false,
  }));

  return { data, total, page, limit };
}







  async updateStatusBulk(ticketIds: string[], to: ItemStatus) {
    // ✅ tìm theo cả id và orderItemId
    const rows = await this.ticketRepo.find({
      where: [
        { id: In(ticketIds) },
        { orderItemId: In(ticketIds) },
      ],
      relations: ['order', 'menuItem'], // 👈 thêm để tránh null khi map
    });

    if (rows.length === 0) {
      throw new NotFoundException('TICKETS_NOT_FOUND');
    }

    // chụp lại trạng thái cũ
    const before = rows.map(r => ({
      orderId: r.order.id,
      ticketId: r.id,
      menuItemId: r.menuItem.id,
      qty: r.qty,
      fromStatus: r.status,
    }));

    // đổi trạng thái
    rows.forEach(r => (r.status = to));
    await this.ticketRepo.save(rows);

    // phát socket: gửi fromStatus + toStatus
    const payload = {
      items: before.map(b => ({ ...b, toStatus: to })),
    };

    this.gw.server.to('cashier').emit('kitchen:ticket_status_changed', payload);
    this.gw.server.to('waiter').emit('kitchen:ticket_status_changed', payload);
    this.gw.server.to('kitchen').emit('kitchen:ticket_status_changed', payload);

    return { status: to, updated: rows.map(r => r.id) };
  }


  // thông báo ngược lại cho FE khi có thay đổi trạng thái từ bếp


  async getOrderProgress(orderId: string): Promise<ProgressRow[]> {
    // Nếu cột số lượng của bạn là "quantity" thì đổi tất cả "kt.qty" -> "kt.quantity"
    const qb = this.ticketRepo.createQueryBuilder('kt')
      .select('kt.menuItemId', 'menuItemId')
      .addSelect('mi.name', 'name')
      .addSelect('COALESCE(SUM(kt.qty),0)', 'notified')
      .addSelect(`COALESCE(SUM(CASE WHEN kt.status = 'PREPARING' THEN kt.qty ELSE 0 END),0)`, 'preparing')
      .addSelect(`COALESCE(SUM(CASE WHEN kt.status = 'READY' THEN kt.qty ELSE 0 END),0)`, 'ready')
      .addSelect(`COALESCE(SUM(CASE WHEN kt.status = 'SERVED' THEN kt.qty ELSE 0 END),0)`, 'served')
      .addSelect(`COALESCE(SUM(CASE WHEN kt.status IN ('READY','SERVED') THEN kt.qty ELSE 0 END),0)`, 'cooked')
      .leftJoin('kt.menuItem', 'mi')
      .where('kt.orderId = :orderId', { orderId })
      .andWhere('kt.status IN (:...live)', { live: LIVE_STATUSES })
      .groupBy('kt.menuItemId')
      .addGroupBy('mi.name');

    const rows = await qb.getRawMany<ProgressRow>();
    return rows;
  }


  async getNotifyHistory(orderId: string): Promise<NotifyBatchDTO[]> {
  const raw = await this.ticketRepo
    .createQueryBuilder('t')
    .innerJoin('t.batch', 'b')
    .innerJoin('t.menuItem', 'mi')
    .select('b.id', 'batchId')
    .addSelect('b.createdAt', 'createdAt')
    .addSelect('b.staff', 'staff')           // 👈 chính là tên người gửi
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
      batchId: string;
      createdAt: Date;
      staff: string;
      tableName: string;
      priority: boolean;
      note: string | null;
      menuItemId: string;
      name: string;
      qty: string;
    }>();

  const map = new Map<string, NotifyBatchDTO>();

  for (const r of raw) {
    const b = map.get(r.batchId) ?? {
      id: r.batchId,
      createdAt: r.createdAt.toISOString(), // ➜ FE new Date() tự convert local time
      staff: r.staff,                       // ➜ tên người gửi
      tableName: r.tableName,
      note: r.note,
      priority: r.priority,
      items: [],
    };
    b.items.push({
      menuItemId: r.menuItemId,
      name: r.name,
      qty: Number(r.qty) || 0,
    });
    map.set(r.batchId, b);
  }

  return Array.from(map.values());
}




  async voidTicketsByOrderItemIds(params: { orderId: string; itemIds: string[]; reason?: string; by?: string }) {
    const { orderId, itemIds, reason, by } = params;
    if (!itemIds?.length) return { count: 0 };

    const victims = await this.ticketRepo.find({
      where: {
        order: { id: orderId } as any,
        orderItemId: In(itemIds),
        status: In([ItemStatus.PENDING, ItemStatus.CONFIRMED]),
      },
      select: ['id', 'orderItemId'],
    });

    if (!victims.length) {
      this.gw.server.to('kitchen').emit('kitchen:tickets_voided', { orderId, ticketIds: [], reason, by });
      return { count: 0 };
    }

    await this.ticketRepo.delete({ id: In(victims.map(v => v.id)) });

    const orderItemIds = victims.map(v => v.orderItemId);
    const payload = { orderId, ticketIds: orderItemIds, reason, by };
    this.gw.server.to('kitchen').emit('kitchen:tickets_voided', payload);
    this.gw.server.to('cashier').emit('kitchen:tickets_voided', payload);
    this.gw.server.to('waiter').emit('kitchen:tickets_voided', payload);

    // ⬇️ NEW: nếu không còn vé sống -> phát "order_voided"
    const liveLeft = await this.ticketRepo.count({
      where: { order: { id: orderId } as any, status: In([ItemStatus.PENDING, ItemStatus.CONFIRMED, ItemStatus.PREPARING, ItemStatus.READY]) },
    });
    if (liveLeft === 0) {
      const clear = { orderId, reason, by };
      this.gw.server.to('kitchen').emit('kitchen:order_voided', clear);
      this.gw.server.to('waiter').emit('kitchen:order_voided', clear);
      this.gw.server.to('cashier').emit('kitchen:order_voided', clear);
    }

    return { count: victims.length };
  }



  async voidTicketsByMenu(opts: {
    orderId: string;
    menuItemId: string;
    qtyToVoid: number;
    reason?: string;
    by?: string;
  }) {
    const { orderId, menuItemId, qtyToVoid, reason, by = "cashier" } = opts;

    // số phần khách muốn huỷ
    let need = qtyToVoid;

    // CHỈ được huỷ PENDING + CONFIRMED
    const cancellable: ItemStatus[] = [
      ItemStatus.PENDING,
      ItemStatus.CONFIRMED,
    ];

    const tickets = await this.ticketRepo.find({
      where: {
        order: { id: orderId } as any,
        menuItem: { id: menuItemId } as any,
        status: In(cancellable),
      },
      order: { createdAt: "DESC" },
    });

    const totalCancelable = tickets.reduce((s, t) => s + Number(t.qty), 0);

    // 👉 Không đủ thì co lại, KHÔNG throw nữa
    if (totalCancelable <= 0) {
      return { patches: [], remainToVoid: qtyToVoid };
    }
    const effectiveQty = Math.min(qtyToVoid, totalCancelable);
    need = effectiveQty;

    const patches: Array<{
      ticketId: string;
      action: "deleted" | "updated";
      qtyBefore: number;
      qtyAfter: number;
    }> = [];

    const voids: Array<{
      fromTicketId: string;
      tempId: string;
      menuItemId: string;
      qty: number;
    }> = [];

    for (const t of tickets) {
      if (need <= 0) break;

      const before = Number(t.qty);
      const take = Math.min(before, need);
      const after = before - take;

      if (after <= 0) {
        await this.ticketRepo.delete(t.id);
        patches.push({
          ticketId: t.id,
          action: "deleted",
          qtyBefore: before,
          qtyAfter: 0,
        });
        voids.push({
          fromTicketId: t.id,
          tempId: `void_${t.id}_${Date.now()}`,
          menuItemId,
          qty: before,
        });
      } else {
        (t as any).qty = after;
        await this.ticketRepo.save(t);
        patches.push({
          ticketId: t.id,
          action: "updated",
          qtyBefore: before,
          qtyAfter: after,
        });
        voids.push({
          fromTicketId: t.id,
          tempId: `void_${t.id}_${Date.now()}`,
          menuItemId,
          qty: take,
        });
      }

      need -= take;
    }

    // thông báo cho bếp patch vé
    this.gw.server.to("kitchen").emit("kitchen:tickets_patched", {
      orderId,
      menuItemId,
      reason,
      by,
      patches,
      voids,
    });

    // 👉 DÙNG effectiveQty khi emit ra ngoài
    // this.gw.emitTicketsVoided({
    //   orderId,
    //   ticketIds: patches.map((p) => p.ticketId),
    //   items: [{ menuItemId, qty: effectiveQty, reason, by }],
    // });

    this.gw.emitTicketStatusChanged({
      orderId,
      items: [
        {
          menuItemId,
          qty: effectiveQty,
          fromStatus: ItemStatus.PENDING,
          toStatus: ItemStatus.CANCELLED,
          reason,
        },
      ],
    });

    const liveLeft = await this.ticketRepo.count({
      where: {
        order: { id: orderId } as any,
        status: In([
          ItemStatus.PENDING,
          ItemStatus.CONFIRMED,
          ItemStatus.PREPARING,
          ItemStatus.READY,
        ]),
      },
    });

    if (liveLeft === 0) {
      const clear = { orderId, reason, by };
      this.gw.server.to("kitchen").emit("kitchen:order_voided", clear);
      this.gw.server.to("waiter").emit("kitchen:order_voided", clear);
      this.gw.server.to("cashier").emit("kitchen:order_voided", clear);
    }

    return { patches, remainToVoid: qtyToVoid - effectiveQty };
  }

    async cancelFromKitchen(opts: {
    ticketId: string;
    qtyToVoid?: number;
    reason?: string;
    by?: string;
  }) {
    const { ticketId, qtyToVoid, reason, by = "kitchen" } = opts;

    const payload = await this.ds.transaction<KitchenVoidPayload | null>(
      async (em) => {
        const tRepo = em.getRepository(KitchenTicket);
        const oiRepo = em.getRepository(OrderItem);

        const t = await tRepo.findOne({
          where: { id: ticketId },
          relations: ["order", "menuItem"],
        });

        if (!t) throw new NotFoundException("TICKET_NOT_FOUND");

        if (![ItemStatus.PENDING, ItemStatus.CONFIRMED].includes(t.status)) {
          throw new BadRequestException(
            `CANNOT_CANCEL_TICKET_IN_STATUS_${t.status}`,
          );
        }

        const ticketQty = Number(t.qty) || 0;
        if (ticketQty <= 0) {
          throw new BadRequestException("TICKET_QTY_INVALID");
        }

        const cancelQty = Math.max(
          1,
          Math.min(ticketQty, Number(qtyToVoid) || ticketQty),
        );
        const remainQty = ticketQty - cancelQty;

        // ----- cập nhật OrderItem -----
        if (t.orderItemId) {
          const oi = await oiRepo.findOne({
            where: { id: t.orderItemId as string },
          });

          if (oi) {
            const after = (oi.quantity || 0) - cancelQty;
            if (after <= 0) {
              // hết lượng → xoá luôn dòng item
              await oiRepo.delete(oi.id);
            } else {
              oi.quantity = after;
              await oiRepo.save(oi);
            }
          }
        }

        // ----- cập nhật KitchenTicket -----
        if (remainQty <= 0) {
          // huỷ hết vé
          t.status = ItemStatus.CANCELLED;
          t.cancelReason = reason ?? null;
          t.cancelledAt = new Date();
          t.cancelledBy = by ?? null;
          await tRepo.save(t);
        } else {
          // huỷ 1 phần vé → giảm qty
          (t as any).qty = remainQty;
          await tRepo.save(t);
        }
await this.orderItemsSvc['logVoid'](em, {
        orderId: t.order.id,
        menuItemId: t.menuItem?.id ?? (t as any).menuItemId,
        qty: cancelQty,
        source: 'kitchen',
        by,
        reason,
      });

      // 🔥 recompute status order
      await this.orderItemsSvc.recomputeOrderStatus(em, t.order.id);

        return {
          orderId: t.order.id,
          menuItemId: t.menuItem?.id ?? (t as any).menuItemId,
          orderItemId: t.orderItemId ?? null,
          qty: cancelQty,
          reason,
          by,
          ticketId: t.id,
        };
      },
    );

    if (payload) {
      // giữ nguyên mớ socket emit bạn đang có
      this.gw.server.to("kitchen").emit("kitchen:tickets_voided", {
        orderId: payload.orderId,
        ticketIds: [payload.ticketId],
        items: [
          {
            menuItemId: payload.menuItemId,
            qty: payload.qty,
            reason: payload.reason,
            by: payload.by,
          },
        ],
      });

      this.gw.server.to("kitchen").emit("kitchen:void_synced", payload);
      this.gw.server.to("cashier").emit("kitchen:void_synced", payload);
      this.gw.server.to("waiter").emit("kitchen:void_synced", payload);

      this.gw.server.to("cashier").emit("kitchen:ticket_cancelled", payload);
      this.gw.server.to("waiter").emit("kitchen:ticket_cancelled", payload);

       await this.notifyWaiterOrderCancelled({
      orderId: payload.orderId,
      reason: payload.reason,
      by: payload.by,
    });
    }

    return { ok: true, ticketId };
  }






  async voidAllByOrder(opts: {
    orderId: string;
    reason?: string;
    by?: string;
    tableName?: string;
  }) {
    const { orderId, reason, by, tableName } = opts;

    // Các trạng thái còn hiện ở UI bếp
    const live: ItemStatus[] = [
      ItemStatus.PENDING,
      ItemStatus.CONFIRMED,
      ItemStatus.PREPARING,
      ItemStatus.READY,
    ];

    const tickets = await this.ticketRepo.find({
      where: { order: { id: orderId } as any, status: In(live) },
      order: { createdAt: 'DESC' },
      relations: ['order', 'menuItem'],
    });

    if (!tickets.length) {
      // vẫn bắn 'order_voided' để FE dọn sạch theo orderId (phòng khi chỉ còn socket cache)
      this.gw.server.to('kitchen').emit('kitchen:order_voided', { orderId, reason, by, tableName });
      this.gw.server.to('waiter').emit('kitchen:order_voided', { orderId, reason, by, tableName });
      this.gw.server.to('cashier').emit('kitchen:order_voided', { orderId, reason, by, tableName });
      return { voidedTicketIds: [], alreadyEmpty: true };
    }

    const touched: string[] = [];

    // Chiến lược: đánh dấu CANCELLED (không xoá cứng), để còn trace
    for (const t of tickets) {
      t.status = ItemStatus.CANCELLED;
      t.cancelledAt = new Date();
      t.cancelReason = reason ?? null;
      t.cancelledBy = by ?? null;
      touched.push(t.id);
    }
    await this.ticketRepo.save(tickets);

    // Phát sự kiện cho 3 phía
    this.gw.server.to('kitchen').emit('kitchen:tickets_voided', {
      orderId,
      ticketIds: touched,       // FE bếp remove theo id (đang mapping id = orderItemId/ticketId)
      tableName,
      by: "cashier",
    });

    this.gw.server.to('kitchen').emit('kitchen:order_voided', { orderId, reason, by, tableName });
    this.gw.server.to('waiter').emit('kitchen:order_voided', { orderId, reason, by, tableName });
    this.gw.server.to('cashier').emit('kitchen:order_voided', { orderId, reason, by, tableName });

    // (tuỳ chọn) phát luôn ticket_status_changed tổng quát
    // this.gw.emitTicketStatusChanged({
    //   orderId,
    //   items: tickets.map(t => ({
    //     ticketId: t.id,
    //     menuItemId: t.menuItem?.id ?? (t as any).menuItemId,
    //     qty: Number(t.qty) || 0,
    //     fromStatus: ItemStatus.PENDING, // chỉ để FE animate; không quá quan trọng
    //     toStatus: ItemStatus.CANCELLED,
    //     reason,
    //   })),
    // });

    return { voidedTicketIds: touched };
  }
}


