import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  Repository,
  EntityManager,
} from 'typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from '../orderitems/entities/orderitem.entity';
import { OrderStatusHistory } from 'src/modules/orderstatushistory/entities/orderstatushistory.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status';
import { AddItemsDto } from 'src/modules/orderitems/dto/create-orderitem.dto';

import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';

import { RestaurantTable } from '../restauranttable/entities/restauranttable.entity';
import { CancelOrderDto } from './dto/cancel-order.dto';

import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoiceStatus, InventoryAction, OrderStatus } from 'src/common/enums';

import { AttachCustomerDto } from 'src/modules/customers/dtos/attach-customers.dto';
import { Customer } from 'src/modules/customers/entities/customers.entity';
import { CustomersService } from 'src/modules/customers/customers.service';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]:   [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]:     [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]:    [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]:      [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory) private readonly histRepo: Repository<OrderStatusHistory>,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
    @InjectRepository(Ingredient) private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(InventoryItem) private readonly invRepo: Repository<InventoryItem>,
    @InjectRepository(InventoryTransaction) private readonly invTxRepo: Repository<InventoryTransaction>,
    @InjectRepository(RestaurantTable) private readonly tableRepo: Repository<RestaurantTable>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly customersSvc: CustomersService,
  ) {}

  /** CREATE: tạo đơn PENDING và TRỪ KHO NGAY */
  async create(dto: CreateOrderDto) {
    return this.ds.transaction(async (em) => {
      const table = await em.getRepository(RestaurantTable).findOneBy({ id: dto.tableId });
      if (!table) throw new NotFoundException('TABLE_NOT_FOUND');

      // load menu items & price
      const ids = dto.items.map((i) => i.menuItemId);
      const menuItems = await em.getRepository(MenuItem).find({ where: { id: In(ids) } });
      if (menuItems.length !== dto.items.length) {
        throw new BadRequestException('ONE_OR_MORE_MENU_ITEMS_NOT_FOUND');
      }
      const priceMap = new Map(menuItems.map((m) => [m.id, Number(m.price)]));

      // create order
      const order = await em.getRepository(Order).save(
        em.getRepository(Order).create({
          table,
          status: OrderStatus.PENDING,
          orderType: dto.orderType ?? undefined,
        }),
      );

      // create items
      const items = dto.items.map((i) =>
        em.getRepository(OrderItem).create({
          order,
          menuItem: { id: i.menuItemId } as any,
          quantity: i.quantity,
          price: priceMap.get(i.menuItemId)!,
        }),
      );
      await em.getRepository(OrderItem).save(items);

      // ✅ TRỪ KHO NGAY KHI PENDING
      await this.consumeInventoryForOrder(em, {
        id: order.id,
        items: items.map((x) => ({ quantity: x.quantity, menuItem: { id: (x.menuItem as any).id } })) as any,
      } as Order);

      // history
      await em.getRepository(OrderStatusHistory).save(
        em.getRepository(OrderStatusHistory).create({ order, status: OrderStatus.PENDING }),
      );

      return em.getRepository(Order).findOne({
        where: { id: order.id },
        relations: ['items', 'items.menuItem', 'table'],
      });
    });
  }

  /** LIST (paging + optional status / excludeStatus) */
  async list(params: { page: number; limit: number; status?: OrderStatus; excludeStatus?: string }) {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.table', 'table')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.menuItem', 'menuItem');

    if (params.status) {
      qb.andWhere('o.status = :st', { st: params.status });
    }
    if (params.excludeStatus) {
      const arr = params.excludeStatus.split(',') as OrderStatus[];
      qb.andWhere('o.status NOT IN (:...ex)', { ex: arr });
    }

    qb.orderBy('o.createdAt', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /** DETAIL */
  async detail(id: string) {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'items.menuItem', 'table'],
    });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
    return order;
  }

  /** UPDATE STATUS: KHÔNG trừ kho khi CONFIRMED nữa; HOÀN KHO khi CANCELLED (kể cả từ PENDING) */
  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      const from = order.status;
      const to = dto.status;
      if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
        throw new BadRequestException(`INVALID_TRANSITION: ${from} -> ${to}`);
      }

      // ❌ Không còn trừ kho ở CONFIRMED (đã trừ khi PENDING)
      // ✅ Hoàn kho khi hủy từ PENDING trở đi (nếu chưa thanh toán)
      if (
        to === OrderStatus.CANCELLED &&
        [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED].includes(from)
      ) {
        await this.restoreInventoryForOrder(em, order);
      }

      order.status = to;
      await oRepo.save(order);

      await em.getRepository(OrderStatusHistory).save(
        em.getRepository(OrderStatusHistory).create({
          order,
          status: to,
        }),
      );

      return oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
    });
  }

  /** ADD ITEMS: áp kho delta cho cả PENDING và CONFIRMED */
  async addItems(orderId: string, dto: AddItemsDto) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
      if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
        throw new BadRequestException('ONLY_ALLOWED_WHEN_PENDING_OR_CONFIRMED');
      }

      const ids = dto.items.map((i) => i.menuItemId);
      const menuItems = await em.getRepository(MenuItem).find({ where: { id: In(ids) } });
      if (menuItems.length !== dto.items.length) throw new BadRequestException('MENU_ITEM_NOT_FOUND');
      const priceMap = new Map(menuItems.map((m) => [m.id, Number(m.price)]));

      const mapByMenu = new Map(order.items.map((it) => [it.menuItem.id, it]));
      for (const it of dto.items) {
        const existed = mapByMenu.get(it.menuItemId);
        if (existed) {
          existed.quantity += it.quantity;
          await em.getRepository(OrderItem).save(existed);
        } else {
          await em.getRepository(OrderItem).save(
            em.getRepository(OrderItem).create({
              order,
              menuItem: { id: it.menuItemId } as any,
              quantity: it.quantity,
              price: priceMap.get(it.menuItemId)!,
            }),
          );
        }
      }

      // ✅ áp kho delta (OUT) cho PENDING/CONFIRMED
      await this.consumeInventoryForDelta(em, order.id, dto.items);

      return oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
    });
  }

  /** REMOVE 1 ITEM: hoàn kho delta cho PENDING/CONFIRMED */
  async removeItem(orderId: string, orderItemId: string) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
      if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
        throw new BadRequestException('ONLY_ALLOWED_WHEN_PENDING_OR_CONFIRMED');
      }

      const it = order.items.find((x) => x.id === orderItemId);
      if (!it) throw new NotFoundException('ORDER_ITEM_NOT_FOUND');

      await em.getRepository(OrderItem).delete(it.id);

      // ✅ hoàn kho delta (IN) cho PENDING/CONFIRMED
      await this.restoreInventoryForDelta(
        em,
        [{ menuItemId: it.menuItem.id, quantity: it.quantity }],
        order.id,
      );

      return oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
    });
  }

  /** SET QTY: cập nhật số lượng và áp kho delta cho PENDING/CONFIRMED */
  async setItemQty(orderId: string, orderItemId: string, quantity: number) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
      if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
        throw new BadRequestException('ONLY_ALLOWED_WHEN_PENDING_OR_CONFIRMED');
      }

      const itRepo = em.getRepository(OrderItem);
      const row = order.items.find((x) => x.id === orderItemId);
      if (!row) throw new NotFoundException('ORDER_ITEM_NOT_FOUND');

      const delta = quantity - row.quantity;

      if (quantity <= 0) {
        // xóa dòng -> hoàn kho toàn bộ qty cũ
        await itRepo.delete(row.id);
        if (row.quantity > 0) {
          await this.restoreInventoryForDelta(
            em,
            [{ menuItemId: row.menuItem.id, quantity: row.quantity }],
            order.id,
          );
        }
      } else {
        row.quantity = quantity;
        await itRepo.save(row);

        if (delta !== 0) {
          if (delta > 0) {
            await this.consumeInventoryForDelta(
              em,
              order.id,
              [{ menuItemId: row.menuItem.id, quantity: delta }],
            );
          } else {
            await this.restoreInventoryForDelta(
              em,
              [{ menuItemId: row.menuItem.id, quantity: -delta }],
              order.id,
            );
          }
        }
      }

      return oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
    });
  }

  /** CANCEL: huỷ đơn; huỷ/void invoice nếu cần; chuyển trạng thái -> CANCELLED (sẽ hoàn kho trong updateStatus) */
  async cancel(orderId: string, dto: CancelOrderDto) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const iRepo = em.getRepository(Invoice);

      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      if (order.status === OrderStatus.PAID) {
        throw new BadRequestException('ORDER_ALREADY_PAID');
      }

      const inv = await iRepo.findOne({ where: { order: { id: orderId } } });
      if (inv) {
        if (inv.status === InvoiceStatus.PAID) {
          throw new BadRequestException('INVOICE_ALREADY_PAID');
        }
        inv.status =
          (InvoiceStatus as any).CANCELLED ??
          (InvoiceStatus as any).VOID ??
          InvoiceStatus.UNPAID;
        await iRepo.save(inv);
      }

      const updated = await this.updateStatus(orderId, { status: OrderStatus.CANCELLED });

      return { ...updated, cancelReason: dto.reason ?? null };
    });
  }

  /** ATTACH CUSTOMER */
  async attachCustomer(orderId: string, dto: AttachCustomerDto) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

    let customerId: string | null = null;

    if (dto.walkin) {
      customerId = (await this.customersSvc.getOrCreateWalkin()).id;
    } else if (dto.customerId) {
      customerId = dto.customerId;
    } else if (dto.phone) {
      const c = await this.customersSvc.upsertByPhone(dto.phone, dto.name);
      customerId = c.id;
    } else {
      throw new BadRequestException('MISSING_CUSTOMER_INFO');
    }

    order.customerId = customerId;
    await this.orderRepo.save(order);
    return order;
  }

  /* ======================= INVENTORY HELPERS ======================= */

  // Trừ kho toàn bộ đơn theo công thức: sum(Ingredient.quantity * OrderItem.quantity)
  private async consumeInventoryForOrder(em: EntityManager, order: Order) {
    const menuIds = order.items.map((it: any) => it.menuItem.id);
    const ingredients = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(menuIds) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    const needMap = new Map<string, number>(); // inventoryItemId -> required qty
    for (const it of order.items as any[]) {
      const ingForMenu = ingredients.filter((ing) => ing.menuItem.id === it.menuItem.id);
      for (const ing of ingForMenu) {
        const need = Number(ing.quantity) * it.quantity;
        needMap.set(ing.inventoryItem.id, (needMap.get(ing.inventoryItem.id) ?? 0) + need);
      }
    }

    await this.applyInventoryDelta(em, needMap, InventoryAction.OUT, 'ORDER', order.id);
  }

  // Trừ kho phần delta khi thêm món
  private async consumeInventoryForDelta(
    em: EntityManager,
    orderId: string,
    deltas: { menuItemId: string; quantity: number }[],
  ) {
    if (!deltas.length) return;

    const ingredients = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(deltas.map((d) => d.menuItemId)) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    const needMap = new Map<string, number>();
    for (const d of deltas) {
      const list = ingredients.filter((ing) => ing.menuItem.id === d.menuItemId);
      for (const ing of list) {
        const need = Number(ing.quantity) * d.quantity;
        needMap.set(ing.inventoryItem.id, (needMap.get(ing.inventoryItem.id) ?? 0) + need);
      }
    }
    await this.applyInventoryDelta(em, needMap, InventoryAction.OUT, 'ORDER', orderId);
  }

  // Hoàn kho toàn bộ đơn
  private async restoreInventoryForOrder(em: EntityManager, order: Order) {
    const menuIds = order.items.map((it) => it.menuItem.id);
    const ingredients = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(menuIds) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    const backMap = new Map<string, number>();
    for (const it of order.items) {
      const ingForMenu = ingredients.filter((ing) => ing.menuItem.id === it.menuItem.id);
      for (const ing of ingForMenu) {
        const qty = Number(ing.quantity) * it.quantity;
        backMap.set(ing.inventoryItem.id, (backMap.get(ing.inventoryItem.id) ?? 0) + qty);
      }
    }
    await this.applyInventoryDelta(em, backMap, InventoryAction.IN, 'ORDER_CANCEL', order.id);
  }

  // Hoàn kho delta khi bớt món
  private async restoreInventoryForDelta(
    em: EntityManager,
    deltas: { menuItemId: string; quantity: number }[],
    orderId: string,
  ) {
    if (!deltas.length) return;

    const ingredients = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(deltas.map((d) => d.menuItemId)) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    const backMap = new Map<string, number>();
    for (const d of deltas) {
      const list = ingredients.filter((ing) => ing.menuItem.id === d.menuItemId);
      for (const ing of list) {
        const qty = Number(ing.quantity) * d.quantity;
        backMap.set(ing.inventoryItem.id, (backMap.get(ing.inventoryItem.id) ?? 0) + qty);
      }
    }
    await this.applyInventoryDelta(em, backMap, InventoryAction.IN, 'ORDER_ITEM_REMOVE', orderId);
  }

  // Áp delta kho (IN/OUT) + validate tồn khi OUT + ghi InventoryTransaction
  private async applyInventoryDelta(
    em: EntityManager,
    deltaMap: Map<string, number>,
    action: InventoryAction,
    refType: string,
    refId: string,
  ) {
    if (deltaMap.size === 0) return;

    const ids = Array.from(deltaMap.keys());
    const items = await em.getRepository(InventoryItem).find({ where: { id: In(ids) } });

    // validate tồn khi OUT
    if (action === InventoryAction.OUT) {
      for (const it of items) {
        const need = deltaMap.get(it.id)!;
        const onHand = Number(it.quantity);
        if (onHand < need) {
          throw new BadRequestException(`INSUFFICIENT_STOCK: ${it.name} cần ${need}, còn ${onHand}`);
        }
      }
    }

    // apply & log
    for (const it of items) {
      const delta = deltaMap.get(it.id)!;
      const before = Number(it.quantity);
      const after = action === InventoryAction.OUT ? before - delta : before + delta;

      it.quantity = after as any; // numeric(12,3)
      await em.getRepository(InventoryItem).save(it);

      await em.getRepository(InventoryTransaction).save(
        em.getRepository(InventoryTransaction).create({
          item: { id: it.id } as any,
          quantity: delta,
          action,
          beforeQty: before,
          afterQty: after,
          refType,
          refId,
          note: `${action === InventoryAction.OUT ? 'Consume' : 'Restore'} by ORDER ${refId}`,
        }),
      );
    }
  }
}
