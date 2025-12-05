import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
} from 'typeorm';

import { OrderItem } from './entities/orderitem.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { VoidEvent } from '../order/entities/void-event.entity';
import { OrderStatusHistory } from '../orderstatushistory/entities/orderstatushistory.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { ItemStatus, OrderStatus } from 'src/common/enums';
import { UpdateItemsStatusDto } from './dto/update-items-status.dto';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';
import { InventoryAction } from 'src/common/enums';
import { CancelItemsDto, CancelPartialDto } from './dto/cancel-items.dto';
import { KitchenService } from 'src/modules/kitchen/kitchen.service';
import { KitchenGateway } from 'src/modules/socket/kitchen.gateway';
import { Inject, forwardRef } from '@nestjs/common';
import {KitchenTicket} from '../kitchen/entities/kitchen-ticket.entity';
import { RestaurantTable } from 'src/modules/restauranttable/entities/restauranttable.entity';
// OrderItemsService
const ALLOWED_ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  [ItemStatus.PENDING]:   [ItemStatus.CONFIRMED, ItemStatus.PREPARING, ItemStatus.CANCELLED], // <-- thêm PREPARING
  [ItemStatus.CONFIRMED]: [ItemStatus.PREPARING, ItemStatus.CANCELLED],
  [ItemStatus.PREPARING]: [ItemStatus.READY, ItemStatus.CANCELLED],
  [ItemStatus.READY]:     [ItemStatus.SERVED, ItemStatus.CANCELLED],
  [ItemStatus.SERVED]:    [],
  [ItemStatus.CANCELLED]: [],
};

@Injectable()
export class OrderItemsService {
  constructor(
    private readonly ds: DataSource,
    @Inject(forwardRef(() => KitchenGateway))
    private readonly gw: KitchenGateway,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatusHistory) private readonly histRepo: Repository<OrderStatusHistory>,
    private readonly kitchenSvc: KitchenService,
    // @InjectRepository(Ingredient) private readonly ingRepo: Repository<Ingredient>,
    // @InjectRepository(InventoryItem) private readonly invRepo: Repository<InventoryItem>,
    // @InjectRepository(InventoryTransaction) private readonly invTxRepo: Repository<InventoryTransaction>,

  ) {}

  /* -------- LIST BY ITEM STATUS -------- */
  // orderitems.service.ts
async listByStatus({ status, page, limit }: { status: ItemStatus; page: number; limit: number }) {
  const qb = this.itemRepo.createQueryBuilder('it')
    .leftJoinAndSelect('it.order', 'o')
    .leftJoinAndSelect('o.table', 'table')
    .leftJoinAndSelect('it.menuItem', 'menuItem')
    .where('it.status = :st', { st: status })
    .orderBy('it.id', 'DESC')   // <-- thay vì it.createdAt
    .skip((page - 1) * limit)
    .take(limit);

  const [rows, total] = await qb.getManyAndCount();
  return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}


  /* -------- BULK UPDATE ITEM STATUS + RECOMPUTE ORDER -------- */
  // orderitems.service.ts
async updateStatusBulk(dto: UpdateItemsStatusDto) {
  return this.ds.transaction(async (em) => {
    const iRepo = em.getRepository(OrderItem);

    const rows = await iRepo.find({
      where: { id: In(dto.itemIds) },
      relations: ['order', 'menuItem'],
    });
    if (rows.length !== dto.itemIds.length) {
      throw new NotFoundException('ONE_OR_MORE_ITEMS_NOT_FOUND');
    }

    const to = dto.status;

    // ❶ Tách món cần đổi & món đã đúng trạng thái (idempotent)
    const changeable = rows.filter(r => r.status !== to);
    const skippedIds = rows.filter(r => r.status === to).map(r => r.id);

    // ❷ Validate transition cho phần cần đổi
    for (const it of changeable) {
      const from = it.status;
      if (!ALLOWED_ITEM_TRANSITIONS[from]?.includes(to)) {
        throw new BadRequestException(`INVALID_ITEM_TRANSITION: ${from} -> ${to}`);
      }
      it.status = to;
    }

    // ❸ Lưu phần cần đổi (nếu có)
    if (changeable.length) {
      await iRepo.save(changeable);
    }

    // ❹ Recompute theo từng order liên quan
    const orderIds = Array.from(new Set(rows.map(r => r.order.id)));
    for (const oid of orderIds) {
      await this.recomputeOrderStatus(em, oid);
    }

    return {
      status: to,
      updated: changeable.map(r => r.id),
      skipped: skippedIds,        // <- các id đã ở trạng thái to
    };
  });
}


  /* -------- AGGREGATION: derive order.status from item statuses -------- */
  private deriveOrderStatusFromItems(
    items: ItemStatus[],
    current: OrderStatus,
  ): OrderStatus {
    // terminal: giữ nguyên
    if (current === OrderStatus.PAID || current === OrderStatus.CANCELLED) {
      return current;
    }

    const active = items.filter((s) => s !== ItemStatus.CANCELLED);
    if (active.length === 0) return OrderStatus.CANCELLED;

    const has = (s: ItemStatus) => active.includes(s as any);
    const all = (pred: (s: ItemStatus) => boolean) => active.every(pred);

    if (all((s) => s === ItemStatus.SERVED)) return OrderStatus.SERVED;
    if (all((s) => s === ItemStatus.READY || s === ItemStatus.SERVED) && has(ItemStatus.READY)) {
      return OrderStatus.READY;
    }
    if (has(ItemStatus.PREPARING)) return OrderStatus.PREPARING;
    if (has(ItemStatus.CONFIRMED)) return OrderStatus.CONFIRMED;
    return OrderStatus.PENDING;
  }

  public async recomputeOrderStatus(em: EntityManager, orderId: string) {
  const oRepo = em.getRepository(Order);
  const hRepo = em.getRepository(OrderStatusHistory);
  const iRepo = em.getRepository(OrderItem);

  const order = await oRepo.findOne({
    where: { id: orderId },
    relations: ['table'],
  });
  if (!order) return;

  if ([OrderStatus.PAID, OrderStatus.CANCELLED].includes(order.status)) return;

  const items = await iRepo.find({ where: { order: { id: orderId } } });
  const itemStatuses = items.map((it) => it.status);


  // 🔻 Nếu tất cả item CANCELLED → tự huỷ order + giải phóng bàn + bắn socket
 const next = this.deriveOrderStatusFromItems(itemStatuses, order.status);
if (next === order.status) return;

order.status = next;
await oRepo.save(order);
await hRepo.save(hRepo.create({ order, status: next }));

// 🔹 Nếu tất cả item CANCELLED → tự bắn socket “order bị huỷ”
// (KHÔNG đụng tới table.status)
if (next === OrderStatus.CANCELLED) {
  this.gw.emitOrderChanged({
    orderId: order.id,
    tableId: order.table?.id ?? '',
    reason: 'ORDER_CANCELLED',
  });
}

}




  // ĐANG SỬ DỤNG 
async cancelItems(dto: CancelItemsDto , userId: string) {
  const { itemIds, reason } = dto;
  const staff = userId;

  return this.ds.transaction(async (em) => {
    const iRepo = em.getRepository(OrderItem);
    const tRepo = em.getRepository(KitchenTicket);

    const rows = await iRepo.find({
      where: { id: In(itemIds) },
      relations: ['order', 'menuItem'],
    });
    if (rows.length !== itemIds.length) {
      throw new NotFoundException('ONE_OR_MORE_ITEMS_NOT_FOUND');
    }
    // chỉ cho huỷ khi chưa PREPARING...
    for (const it of rows) {
      if (![ItemStatus.PENDING, ItemStatus.CONFIRMED].includes(it.status)) {
        throw new BadRequestException(`CANNOT_CANCEL_IN_STATUS_${it.status}`);
      }
    }

    await this.restoreInventoryForItems(em, rows);

    for (const it of rows) {
      it.status = ItemStatus.CANCELLED;
      it.cancelReason = reason ?? null;
      it.cancelledAt = new Date();
      it.cancelledBy = staff;
    }
    await iRepo.save(rows);
for (const it of rows) {
      await this.logVoid(em, {
        orderId: it.order.id,
        menuItemId: it.menuItem.id,
        qty: Number(it.quantity),
        source: 'cashier',       // hoặc 'waiter' tùy API
        by: staff,
        reason,
      });
    }
    //  DỌN TICKET BẾP: soft-delete theo orderItemId
    await tRepo.softDelete({ orderItemId: In(itemIds) });

    // //  Emit cho bếp ẩn ngay (FE dùng orderItemId làm key)
    // this.gw.emitTicketsVoided({
    //   orderId: rows[0].order.id,
    //   ticketIds: itemIds,        // <-- quan trọng
    //  by: "cashier",
    // });




for (const it of rows) {
  this.gw.emitVoidSynced({
    orderId: it.order.id,
    menuItemId: it.menuItem.id,
    qty: it.quantity,
    reason,
    by: "cashier",     // phân biệt BẾP / THU NGÂN
  });
}

    // Recompute order
    const orderIds = Array.from(new Set(rows.map(r => r.order.id)));
    for (const oid of orderIds) {
      await this.recomputeOrderStatus(em, oid);
    }

    // (tuỳ chọn) cũng bắn event status_changed để FE bếp đồng bộ 3 cột
    this.gw.emitTicketStatusChanged({
      orderId: rows[0].order.id,
      items: rows.map(r => ({
        menuItemId: r.menuItem.id,
        qty: Number(r.quantity),
        fromStatus: ItemStatus.PENDING,   // hoặc CONFIRMED tuỳ thực tế
        toStatus: ItemStatus.CANCELLED,
        reason,
      })),
    });

    return { cancelled: rows.map(r => r.id), reason, staff };
  });
}


// ===== huỷ MỘT PHẦN của 1 dòng =====
async cancelPartial(dto: CancelPartialDto, userId: string) {
  const staff = userId;

  return this.ds.transaction(async (em) => {
    const iRepo = em.getRepository(OrderItem);
    const it = await iRepo.findOne({
      where: { id: dto.itemId },
      relations: ['order', 'menuItem'],
    });
    if (!it) throw new NotFoundException('ITEM_NOT_FOUND');

    if (![ItemStatus.PENDING, ItemStatus.CONFIRMED].includes(it.status)) {
      throw new BadRequestException(`CANNOT_CANCEL_IN_STATUS_${it.status}`);
    }
    if (dto.qty > it.quantity) {
      throw new BadRequestException('CANCEL_QTY_EXCEEDS_ITEM_QTY');
    }

    // hoàn kho phần huỷ
    const fakeRow = { ...it, quantity: dto.qty } as OrderItem;
    await this.restoreInventoryForItems(em, [fakeRow]);

    if (dto.qty === it.quantity) {
      it.status = ItemStatus.CANCELLED;
      it.cancelledAt = new Date();
      it.cancelReason = dto.reason ?? null;
      it.cancelledBy = staff;                    // 👈 gán từ JWT
      await iRepo.save(it);
    } else {
      // tách row
      it.quantity -= dto.qty;
      await iRepo.save(it);

      const cancelled = iRepo.create({
        order: it.order,
        menuItem: it.menuItem,
        quantity: dto.qty,
        status: ItemStatus.CANCELLED,
        cancelReason: dto.reason ?? null,
        price: it.price,
        cancelledAt: new Date(),
        cancelledBy: staff,                      // 👈 gán từ JWT
      });
      await iRepo.save(cancelled);
    }
await this.logVoid(em, {
  orderId: it.order.id,
  menuItemId: it.menuItem.id,
  qty: dto.qty,
  source: 'cashier',
  by: staff,
  reason: dto.reason ?? null,
});

    // GỠ TICKET Ở BẾP (nếu bạn đã tách KitchenTicket)
    await this.kitchenSvc.voidTicketsByMenu({
      orderId: it.order.id,
      menuItemId: it.menuItem.id,
      qtyToVoid: dto.qty,
      reason: dto.reason,
      by: "cashier",                           // 👈 truyền tên người huỷ cho bếp
    });



this.gw.emitTicketStatusChanged({
  orderId: it.order.id,
  items: [{
    menuItemId: it.menuItem.id,
    qty: dto.qty,
    fromStatus: ItemStatus.PENDING,   // hoặc ItemStatus.CONFIRMED tùy rule
    toStatus: ItemStatus.CANCELLED,
    reason: dto.reason ?? null,
  }],
});

// this.gw.emitTicketsVoided({
//   orderId: it.order.id,
//   items: [{ menuItemId: it.menuItem.id, qty: dto.qty, reason: dto.reason ?? null, by: staff }],
// });
this.gw.emitVoidSynced({
  orderId: it.order.id,
  menuItemId: it.menuItem.id,
  qty: dto.qty,
  reason: dto.reason ?? null,
  by: "cashier",
});

    await this.recomputeOrderStatus(em, it.order.id);
    return { ok: true, itemId: it.id, cancelledQty: dto.qty, staff };
  });
}
  /** Hoàn kho toàn bộ quantity của các item (copy logic từ OrdersService) */
  private async restoreInventoryForItems(em: EntityManager, items: OrderItem[]) {
    if (!items.length) return;
    const menuIds = items.map(i => i.menuItem.id);
    const ings = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(menuIds) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    // inventoryItemId -> qty cần trả
    const backMap = new Map<string, number>();
    for (const it of items) {
      const set = ings.filter(ing => ing.menuItem.id === it.menuItem.id);
      for (const ing of set) {
        const qty = Number(ing.quantity) * it.quantity;
        backMap.set(ing.inventoryItem.id, (backMap.get(ing.inventoryItem.id) ?? 0) + qty);
      }
    }

    // Lấy inventory items
    const invIds = Array.from(backMap.keys());
    const invs = await em.getRepository(InventoryItem).find({ where: { id: In(invIds) } });

    // Apply & log
    for (const inv of invs) {
      const delta = backMap.get(inv.id)!;
      const before = Number(inv.quantity);
      const after = before + delta;
      inv.quantity = after as any;
      await em.getRepository(InventoryItem).save(inv);

      await em.getRepository(InventoryTransaction).save(
        em.getRepository(InventoryTransaction).create({
          item: { id: inv.id } as any,
          quantity: delta,
          action: InventoryAction.IN,
          beforeQty: before,
          afterQty: after,
          refType: 'ORDER_ITEM_CANCEL',
          refId: items[0].order.id, // gắn orderId bất kỳ trong batch
          note: 'Restore by CANCELLED order items',
        }),
      );
    }
  }













async moveOne(itemId: string, to: ItemStatus) {
  return this.ds.transaction(async (em) => {
    const iRepo = em.getRepository(OrderItem);
    const oRepo = em.getRepository(Order);

    const it = await iRepo.findOne({
      where: { id: itemId },
      relations: ['order', 'menuItem'],
    });
    if (!it) throw new NotFoundException('ITEM_NOT_FOUND');

    // validate transition cho 1 đơn vị
    if (!ALLOWED_ITEM_TRANSITIONS[it.status]?.includes(to)) {
      throw new BadRequestException(`INVALID_ITEM_TRANSITION: ${it.status} -> ${to}`);
    }

    if (it.quantity > 1) {
      // giảm 1 ở row cũ
      it.quantity -= 1;
      await iRepo.save(it);

      // tạo row mới số lượng 1, trạng thái = to
      const clone = iRepo.create({
        order: it.order,
        menuItem: it.menuItem,
        quantity: 1,
         price: it.price, 
        status: to,
      });
      await iRepo.save(clone);

      await this.recomputeOrderStatus(em, it.order.id);
      return { movedId: clone.id, fromId: it.id, qtyChanged: 1, status: to };
    } else {
      // quantity = 1: đổi trạng thái chính row đó
      it.status = to;
      await iRepo.save(it);

      await this.recomputeOrderStatus(em, it.order.id);
      return { movedId: it.id, fromId: null, qtyChanged: 1, status: to };
    }
  });
}


  async updateNote(itemId: string, note: string | null, userId: string) {
  console.log("[updateNote] called", { itemId, note, userId });

  const it = await this.itemRepo.findOne({
    where: { id: itemId },
    relations: ['order', 'menuItem'],
  });
  if (!it) {
    console.log("[updateNote] ITEM_NOT_FOUND", itemId);
    throw new NotFoundException('ITEM_NOT_FOUND');
  }

  it.note = note;
  const saved = await this.itemRepo.save(it);
  console.log("[updateNote] saved", { id: saved.id, note: saved.note });

  this.gw.emitItemNoteUpdated?.({
    orderId: it.order.id,
    orderItemId: it.id,
    menuItemId: it.menuItem.id,
    note,
    by: userId,
  });

  return { ok: true, id: it.id, note };
}



private async logVoid(
  em: EntityManager,
  params: {
    orderId: string;
    menuItemId: string;
    qty: number;
    source: 'cashier' | 'waiter' | 'kitchen';
    by?: string | null;      // userId
    reason?: string | null;
  },
) {
  const order = await em.getRepository(Order).findOne({
    where: { id: params.orderId },
    relations: ['table'],
  });
  if (!order) return;

  const evRepo = em.getRepository(VoidEvent);

let byUser: User | null = null;

if (params.by) {
  byUser = await em.getRepository(User).findOne({
    where: { id: params.by },
    relations: ['profile'],
  });
}

  const ev = evRepo.create({
    order,
    table: order.table ?? null,
    menuItem: { id: params.menuItemId } as any,
    qty: params.qty,
    source: params.source,
    by: params.by ?? null, 
    reason: params.reason ?? null,
    createdBy: byUser,
  });

  await evRepo.save(ev);
}


}
