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
import { OrderStatusHistory } from '../orderstatushistory/entities/orderstatushistory.entity';

import { ItemStatus, OrderStatus } from 'src/common/enums';
import { UpdateItemsStatusDto } from './dto/update-items-status.dto';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';
import { InventoryAction } from 'src/common/enums';
import { CancelItemsDto } from './dto/cancel-items.dto';
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
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatusHistory) private readonly histRepo: Repository<OrderStatusHistory>,
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

    const order = await oRepo.findOne({ where: { id: orderId } });
    if (!order) return;

    // terminal -> bỏ qua
    if ([OrderStatus.PAID, OrderStatus.CANCELLED].includes(order.status)) return;

    const items = await iRepo.find({ where: { order: { id: orderId } } });
    const itemStatuses = items.map((it) => it.status);

    const next = this.deriveOrderStatusFromItems(itemStatuses, order.status);
    if (next !== order.status) {
      order.status = next;
      await oRepo.save(order);
      await hRepo.save(hRepo.create({ order, status: next }));
    }
  }



  // async cancelItems(dto: CancelItemsDto) {
  //   return this.ds.transaction(async (em) => {
  //     const rows = await em.getRepository(OrderItem).find({
  //       where: { id: In(dto.itemIds) },
  //       relations: ['order', 'menuItem'],
  //     });
  //     if (rows.length !== dto.itemIds.length) {
  //       throw new NotFoundException('ONE_OR_MORE_ITEMS_NOT_FOUND');
  //     }

  //     // Chỉ cho huỷ khi chưa PREPARING
  //     for (const it of rows) {
  //       if (![ItemStatus.PENDING, ItemStatus.CONFIRMED].includes(it.status)) {
  //         throw new BadRequestException(`CANNOT_CANCEL_IN_STATUS_${it.status}`);
  //       }
  //     }

  //     // Hoàn kho theo delta = full quantity của item
  //     await this.restoreInventoryForItems(em, rows);

  //     // Đánh dấu CANCELLED + lý do
  //     for (const it of rows) {
  //       it.status = ItemStatus.CANCELLED;
  //       it.cancelReason = dto.reason;
  //       it.cancelledAt = new Date();
  //     }
  //     await em.getRepository(OrderItem).save(rows);

  //     // Recompute từng order
  //     const orderIds = Array.from(new Set(rows.map((r) => r.order.id)));
  //     for (const oid of orderIds) {
  //       await this.recomputeOrderStatus(em, oid);
  //     }

  //     return { cancelled: rows.map((r) => r.id), reason: dto.reason };
  //   });
  // }

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


}
