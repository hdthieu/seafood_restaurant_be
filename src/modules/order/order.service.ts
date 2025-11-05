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
import { randomUUID } from 'crypto';
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
import { Customer } from 'src/modules/customers/entities/customers.entity';
import { CustomersService } from 'src/modules/customers/customers.service';
import { ItemStatus } from "src/common/enums"
import { forwardRef } from '@nestjs/common';
import { OrderItemsService } from 'src/modules/orderitems/orderitems.service';
import { Inject } from "@nestjs/common";
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { MergeOrderDto } from './dto/merge-order.dto';
import { KitchenGateway } from '@modules/socket/kitchen.gateway';
import { KitchenTicket } from '@modules/kitchen/entities/kitchen-ticket.entity';
import { SplitOrderDto } from './dto/split-order.dto';
import { DeepPartial } from 'typeorm';
import { KitchenService } from '@modules/kitchen/kitchen.service';
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.MERGED]: [],
};

const EDITABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];



@Injectable()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class OrdersService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @Inject(forwardRef(() => OrderItemsService))
    private readonly orderItemsSvc: OrderItemsService,
    private readonly gw: KitchenGateway,

    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(RestaurantTable) private readonly tableRepo: Repository<RestaurantTable>,
    @InjectRepository(KitchenTicket) private readonly ticketRepo: Repository<KitchenTicket>,
    private readonly kitchenSvc: KitchenService,
  ) { }



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


















  /** CREATE: tạo đơn PENDING, tạo item PENDING, trừ kho ngay, ghi history, recompute */
  async create(dto: CreateOrderDto, userId: string) {
    return this.ds.transaction(async (em) => {
      const table = await em.getRepository(RestaurantTable).findOneBy({ id: dto.tableId });
      if (!table) throw new NotFoundException('TABLE_NOT_FOUND');

      const ids = dto.items.map((i) => i.menuItemId);
      const menuItems = await em.getRepository(MenuItem).find({ where: { id: In(ids) } });
      if (menuItems.length !== dto.items.length) {
        throw new BadRequestException('ONE_OR_MORE_MENU_ITEMS_NOT_FOUND');
      }
      const priceMap = new Map(menuItems.map((m) => [m.id, Number(m.price)]));

      const order = await em.getRepository(Order).save(
        em.getRepository(Order).create({
          table,
          status: OrderStatus.PENDING,
          orderType: dto.orderType ?? undefined,
          createdBy: { id: userId } as any,
        }),
      );

      // tạo item: luôn là dòng mới, status PENDING
      const items = dto.items.map((i) =>
        em.getRepository(OrderItem).create({
          order,
          menuItem: { id: i.menuItemId } as any,
          quantity: i.quantity,
          price: priceMap.get(i.menuItemId)!,
          status: ItemStatus.PENDING,
          batchId: null,
        }),
      );
      await em.getRepository(OrderItem).save(items);

      // trừ kho
      await this.consumeInventoryForOrder(em, {
        id: order.id,
        items: items.map((x) => ({ quantity: x.quantity, menuItem: { id: (x.menuItem as any).id } })) as any,
      } as Order);

      // history
      await em.getRepository(OrderStatusHistory).save(
        em.getRepository(OrderStatusHistory).create({ order, status: OrderStatus.PENDING }),
      );

      // recompute từ item (giữ PENDING nhưng đảm bảo logic thống nhất)
      await this.orderItemsSvc.recomputeOrderStatus(em, order.id);

      const saved = await em.getRepository(Order).findOne({
        where: { id: order.id },
        relations: ['items', 'items.menuItem', 'table'],
      });

      // 🔔 phát socket
      this.gw.emitOrderChanged({
        orderId: saved!.id,
        tableId: saved!.table.id,
        reason: 'CREATED',
      });

      return saved;
    });
  }


  /** LIST (paging + optional status / excludeStatus) */
  async list(params: { page: number; limit: number; status?: OrderStatus; excludeStatus?: string }) {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.table', 'table')
      // ✅ chỉ join items chưa CANCELLED
      .leftJoinAndSelect(
        'o.items',
        'items',
        'items.status != :cancelled',
        { cancelled: 'CANCELLED' },
      )
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

    // ✅ Phòng hờ filter thêm lần nữa (nếu items bị null)
    for (const o of rows) {
      if (Array.isArray(o.items)) {
        o.items = o.items.filter((it) => it.status !== 'CANCELLED');
      }
    }

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

  /** UPDATE STATUS: soft re-confirm; KHÔNG trừ kho ở CONFIRMED; hoàn kho khi CANCELLED */
  /** UPDATE STATUS: soft re-confirm; không đụng kho ở CONFIRMED; CANCELLED thì hoàn kho & cancel item; recompute */
  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const iRepo = em.getRepository(OrderItem);

      const order = await oRepo.findOne({ where: { id: orderId }, relations: ['items', 'items.menuItem'] });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      const from = order.status;
      const to = dto.status;

      // Soft re-confirm: cho phép gọi CONFIRMED nhiều lần chỉ để "báo bếp"
      // Soft re-confirm: cho phép gọi CONFIRMED nhiều lần chỉ để "báo bếp"
      if (to === OrderStatus.CONFIRMED && ![OrderStatus.PAID, OrderStatus.CANCELLED].includes(from)) {
        await em.getRepository(OrderStatusHistory).save(
          em.getRepository(OrderStatusHistory).create({ order, status: OrderStatus.CONFIRMED }),
        );

        const saved = await oRepo.findOne({
          where: { id: orderId },
          relations: ['items', 'items.menuItem', 'table'],
        });

        this.gw.emitOrderChanged({
          orderId: saved!.id,
          tableId: saved!.table.id,
          reason: 'ORDER_STATUS',
        });

        return saved;
      }


      if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
        throw new BadRequestException(`INVALID_TRANSITION: ${from} -> ${to}`);
      }

      // Hủy đơn: hoàn kho toàn bộ + set item -> CANCELLED
      if (to === OrderStatus.CANCELLED) {
        await this.restoreInventoryForOrder(em, order);
        const activeItems = await iRepo.find({ where: { order: { id: orderId } } });
        for (const it of activeItems) it.status = ItemStatus.CANCELLED;
        await iRepo.save(activeItems);
      }

      order.status = to;
      await oRepo.save(order);

      await em.getRepository(OrderStatusHistory).save(
        em.getRepository(OrderStatusHistory).create({ order, status: to }),
      );

      // recompute để đồng bộ (trường hợp CANCELLED → giữ nguyên)
      await this.orderItemsSvc.recomputeOrderStatus(em, order.id);

      const saved = await oRepo.findOne({ where: { id: orderId }, relations: ['items', 'items.menuItem', 'table'] });
      this.gw.emitOrderChanged({ orderId: saved!.id, tableId: saved!.table.id, reason: to === OrderStatus.CANCELLED ? 'ORDER_CANCELLED' : 'ORDER_STATUS' });
      return saved;

    });
  }





  // ...


  /** ADD ITEMS: mỗi lần báo tạo dòng mới (không gộp), set ItemStatus ban đầu, gán batchId, trừ kho delta, recompute */
  async addItems(orderId: string, dto: AddItemsDto) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const itRepo = em.getRepository(OrderItem);
      const mRepo = em.getRepository(MenuItem);

      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      const EDITABLE_STATUSES: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.SERVED,
      ];
      if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new BadRequestException('ORDER_NOT_EDITABLE_IN_THIS_STATUS');
      }

      const ids = dto.items.map((i) => i.menuItemId);
      const menuItems = await mRepo.find({ where: { id: In(ids) } });
      if (menuItems.length !== dto.items.length) {
        throw new BadRequestException('MENU_ITEM_NOT_FOUND');
      }
      const priceMap = new Map(menuItems.map((m) => [m.id, Number(m.price)]));

      const batchId = dto.batchId || randomUUID();

      // 1) Tạo các dòng mới
      const toCreate = dto.items
        .filter((i) => i.quantity > 0)
        .map((i) =>
          itRepo.create({
            order,
            menuItem: { id: i.menuItemId } as any,
            quantity: i.quantity,
            price: priceMap.get(i.menuItemId)!,
            status: ItemStatus.PENDING, // hoặc ItemStatus.CONFIRMED nếu coi "thêm" là đã báo bếp
            batchId,
          }),
        );

      if (!toCreate.length) {
        return oRepo.findOne({
          where: { id: orderId },
          relations: ['items', 'items.menuItem', 'table'],
        });
      }

      await itRepo.save(toCreate);

      // 2) Trừ kho phần delta
      await this.consumeInventoryForDelta(
        em,
        order.id,
        dto.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
      );

      // 3) Recompute theo item
      await this.orderItemsSvc.recomputeOrderStatus(em, order.id);

      // 4) Notify bếp (kèm batchId) — có thể không tạo KitchenTicket riêng
      // try {
      //   const tableName = order.table?.name;
      //   this.gw.server.to('kitchen').emit('kitchen:notify', {
      //     orderId,
      //     tableName,
      //     batchId,
      //     createdAt: new Date().toISOString(),
      //     priority: false,
      //     note: (dto as any).note ?? null, // nếu bạn có note trong DTO
      //     items: toCreate.map((x) => ({
      //       ticketId: null,               // nếu bạn chưa tạo KitchenTicket riêng
      //       orderItemId: x.id,            // FE bếp fallback theo orderItemId
      //       name: x.menuItem.name,        // cần name -> có thể truy thêm nếu cần
      //       qty: x.quantity,
      //     })),
      //   });
      // } catch {
      //   // không để lỗi socket chặn giao dịch
      // }

      // 5) Trả về đơn đã cập nhật + emit cashier
      const saved = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });

      // thông báo FE thu ngân cập nhật
      this.gw.emitOrderChanged({
        orderId: saved!.id,
        tableId: saved!.table.id,
        reason: 'ITEMS_ADDED',
      });

      return saved;
    });
  }

  /** REMOVE 1 ITEM: hoàn kho delta, recompute */
  async removeItem(orderId: string, orderItemId: string) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const order = await oRepo.findOne({ where: { id: orderId }, relations: ['items', 'items.menuItem'] });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      const EDITABLE_STATUSES = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED];
      if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new BadRequestException('ORDER_NOT_EDITABLE_IN_THIS_STATUS');
      }

      const it = order.items.find((x) => x.id === orderItemId);
      if (!it) throw new NotFoundException('ORDER_ITEM_NOT_FOUND');

      await em.getRepository(OrderItem).delete(it.id);

      if (it.quantity > 0) {
        await this.restoreInventoryForDelta(em, [{ menuItemId: it.menuItem.id, quantity: it.quantity }], order.id);
      }

      // recompute theo item
      await this.orderItemsSvc.recomputeOrderStatus(em, order.id);

      const saved = await oRepo.findOne({ where: { id: orderId }, relations: ['items', 'items.menuItem', 'table'] });
      this.gw.emitOrderChanged({ orderId: saved!.id, tableId: saved!.table.id, reason: 'ITEM_REMOVED' });
      return saved;

    });
  }



  /** SET QTY: cập nhật số lượng & áp kho delta; cho phép ở mọi trạng thái trừ PAID/CANCELLED */
  /** SET QTY: cập nhật số lượng & áp kho delta; nếu qty<=0 thì xóa dòng; recompute */
  /** SET QTY: cập nhật số lượng; nếu qty<=0 thì xoá dòng; áp kho theo delta;
 *  delta>0 (tăng) sẽ tạo ticket cho phần tăng và notify bếp; recompute & emit cashier
 */
  async setItemQty(orderId: string, orderItemId: string, quantity: number) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const itRepo = em.getRepository(OrderItem);

      // (1) Load order
      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      // (2) Kiểm tra trạng thái
      if ([OrderStatus.PAID, OrderStatus.CANCELLED].includes(order.status)) {
        throw new BadRequestException('ORDER_NOT_EDITABLE_IN_THIS_STATUS');
      }

      // (3) Tìm dòng món
      const row = order.items.find((x) => x.id === orderItemId);
      if (!row) throw new NotFoundException('ORDER_ITEM_NOT_FOUND');
      if (![ItemStatus.PENDING, ItemStatus.CONFIRMED].includes(row.status)) {
        throw new BadRequestException(`CANNOT_CHANGE_QTY_WHEN_${row.status}`);
      }

      // (4) Tính chênh lệch số lượng
      const delta = quantity - row.quantity;

      if (quantity <= 0) {
        // Xóa món + hoàn kho
        await itRepo.delete(row.id);
        if (row.quantity > 0) {
          await this.restoreInventoryForDelta(
            em,
            [{ menuItemId: row.menuItem.id, quantity: row.quantity }],
            order.id,
          );
        }
      } else {
        // Cập nhật số lượng
        row.quantity = quantity;
        await itRepo.save(row);

        if (delta > 0) {
          // ======================== BẮT ĐẦU PHẦN TẠO TICKET & SOCKET ========================
          const batchId = randomUUID();

          const qr = em.queryRunner!;
          await qr.query('SAVEPOINT kt_savepoint');

          try {
            const ktRepo = em.getRepository(KitchenTicket);

            const partial: DeepPartial<KitchenTicket> = {
              order: { id: order.id } as any,
              orderItemId: { id: row.id } as any,
              menuItem: { id: row.menuItem.id } as any,
              // Bỏ comment nếu entity có 2 cột này:
              // quantity: delta,
              // status: ItemStatus.PENDING,
              batchId,
            };

            const savedTicket = await ktRepo.save(ktRepo.create(partial));

            // Emit socket báo bếp
//             this.gw.emitNotifyItemsToKitchen({
//   orderId: order.id,
//   tableName: order.table?.name ?? '',
//   batchId,
//   createdAt: new Date().toISOString(),
//   // staff: userId || 'SYSTEM',          
//   priority: false,
//   items: [
//     {
//       ticketId: savedTicket.id,
//       menuItemId: row.menuItem.id,
//       name: row.menuItem.name,
//       qty: delta,
//       orderItemId: row.id,
//     },
//   ],
// });
          } catch (err) {
            // rollback về savepoint để transaction không bị abort
            await qr.query('ROLLBACK TO SAVEPOINT kt_savepoint');
            // // vẫn báo bếp nếu muốn
            // this.gw.server.to('kitchen').emit('kitchen:notify', {
            //   orderId: order.id,
            //   tableName: order.table?.name,
            //   batchId,
            //   createdAt: new Date().toISOString(),
            //   priority: false,
            //   note: null,
            //   items: [
            //     {
            //       orderItemId: row.id,
            //       name: row.menuItem.name,
            //       qty: delta,
            //     },
            //   ],
            // });
          }
          // ======================== KẾT THÚC PHẦN TẠO TICKET & SOCKET ========================

          // Trừ kho phần tăng
          await this.consumeInventoryForDelta(
            em,
            order.id,
            [{ menuItemId: row.menuItem.id, quantity: delta }],
          );

        } else if (delta < 0) {
          // Hoàn kho phần giảm
          await this.restoreInventoryForDelta(
            em,
            [{ menuItemId: row.menuItem.id, quantity: -delta }],
            order.id,
          );
        }
      }

      // (5) Cập nhật trạng thái đơn
      await this.orderItemsSvc.recomputeOrderStatus(em, order.id);

      // (6) Gửi socket báo thu ngân
      const saved = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });

      this.gw.emitOrderChanged({
        orderId: saved!.id,
        tableId: saved!.table.id,
        reason: 'ITEM_QTY_SET',
      });

      return saved;
    });
  }



  private async restoreInventoryForItems(
    em: EntityManager,
    items: OrderItem[],
    orderId: string,          // 👈 thêm tham số
  ) {
    if (!items.length) return;

    const menuIds = items.map(i => i.menuItem.id);
    const ings = await em.getRepository(Ingredient).find({
      where: { menuItem: { id: In(menuIds) } },
      relations: ['inventoryItem', 'menuItem'],
    });

    const backMap = new Map<string, number>();
    for (const it of items) {
      const set = ings.filter(ing => ing.menuItem.id === it.menuItem.id);
      for (const ing of set) {
        const qty = Number(ing.quantity) * it.quantity;
        backMap.set(ing.inventoryItem.id, (backMap.get(ing.inventoryItem.id) ?? 0) + qty);
      }
    }

    await this.applyInventoryDelta(
      em,
      backMap,
      InventoryAction.IN,
      'ORDER_ITEM_CANCEL',
      orderId,                 // 👈 dùng orderId truyền vào
    );
  }



  /** CANCEL: huỷ đơn; huỷ/void invoice nếu cần; chuyển trạng thái -> CANCELLED (sẽ hoàn kho trong updateStatus) */
  async cancel(orderId: string, dto: CancelOrderDto, userId?: string) {
    return this.ds.transaction(async (em) => {
      const oRepo = em.getRepository(Order);
      const iRepo = em.getRepository(Invoice);
      const itRepo = em.getRepository(OrderItem);

      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      if (order.status === OrderStatus.PAID) {
        throw new BadRequestException('ORDER_ALREADY_PAID');
      }

      // 1) Hoá đơn (nếu có)
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

      // 2) Huỷ toàn bộ order_items còn sống (PENDING/CONFIRMED/PREPARING/READY)
      //    và HOÀN KHO cho phần chưa phục vụ (tuỳ rule: thường hoàn kho khi chưa SERVED)
      const liveItemStatuses: ItemStatus[] = [
        ItemStatus.PENDING,
        ItemStatus.CONFIRMED,
        ItemStatus.PREPARING,
        ItemStatus.READY,
      ];
      const liveItems = order.items.filter(it => liveItemStatuses.includes(it.status));

      if (liveItems.length) {
        // hoàn kho theo công thức của bạn
        await this.restoreInventoryForItems(em, liveItems, order.id);

        for (const it of liveItems) {
          it.status = ItemStatus.CANCELLED;
          it.cancelledAt = new Date();
          it.cancelReason = dto?.reason ?? null;
          it.cancelledBy = userId ?? null;
        }
        await itRepo.save(liveItems);
      }

      // 3) Đặt trạng thái Order = CANCELLED + ghi history
      order.status = OrderStatus.CANCELLED;
      await oRepo.save(order);
      await em.getRepository(OrderStatusHistory).save(
        em.getRepository(OrderStatusHistory).create({ order, status: OrderStatus.CANCELLED }),
      );

      // 4) BẾP: HUỶ TOÀN BỘ ticket còn sống của order này + bắn socket
      await this.kitchenSvc.voidAllByOrder({
        orderId,
        reason: dto?.reason,
        by: userId ?? 'system',
        tableName: order.table?.name ?? '',
      });

      return {
        orderId,
        status: OrderStatus.CANCELLED,
        cancelReason: dto?.reason ?? null,
      };
    });
  }


  // ⬇️ Thêm vào OrdersService
  // OrdersService





  // gộp order 
  async mergeOrders(fromId: string, toId: string) {
    if (!fromId || !toId) throw new BadRequestException('MISSING_ORDER_ID');
    if (fromId === toId) throw new BadRequestException('SAME_ORDER');

    return this.ds.transaction(async (trx) => {
      const orderRepo = trx.getRepository(Order);
      const itemRepo = trx.getRepository(OrderItem);

      // 1) KHÓA 2 đơn (ONLY base table, KHÔNG JOIN)
      const locked = await orderRepo
        .createQueryBuilder('o')
        .where('o.id IN (:...ids)', { ids: [fromId, toId] })
        .setLock('pessimistic_write')        // SELECT ... FOR UPDATE OF o
        .getMany();

      const lockedFrom = locked.find(o => o.id === fromId);
      const lockedTo = locked.find(o => o.id === toId);
      if (!lockedFrom) throw new NotFoundException('SOURCE_ORDER_NOT_FOUND');
      if (!lockedTo) throw new NotFoundException('TARGET_ORDER_NOT_FOUND');

      // (Tuỳ chọn) KHÓA luôn các items thuộc 2 đơn để tránh race khi cộng dồn
      await itemRepo
        .createQueryBuilder('oi')
        .where('oi.orderId IN (:...ids)', { ids: [fromId, toId] })
        .setLock('pessimistic_write')
        .getMany();

      // 2) Load đầy đủ relations (KHÔNG khoá, vì base rows đã bị khoá)
      const [from, to] = await Promise.all([
        orderRepo.findOne({
          where: { id: fromId },
          relations: ['items', 'items.menuItem', 'table'],
        }),
        orderRepo.findOne({
          where: { id: toId },
          relations: ['items', 'items.menuItem', 'table'],
        }),
      ]);
      if (!from) throw new NotFoundException('SOURCE_ORDER_NOT_FOUND');
      if (!to) throw new NotFoundException('TARGET_ORDER_NOT_FOUND');

      if ([OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.MERGED].includes(to.status)) {
        throw new BadRequestException('TARGET_ORDER_INVALID_STATUS');
      }

      // 3) Map items đích để cộng dồn
      const keyOf = (menuItemId: string, note?: string | null) => `${menuItemId}__${(note ?? '').trim()}`;
      const targetMap = new Map<string, OrderItem>();
      for (const it of to.items ?? []) targetMap.set(keyOf(it.menuItem.id, it.note), it);

      // 4) Duyệt items nguồn
      for (const src of from.items ?? []) {
        const k = keyOf(src.menuItem.id, src.note);
        const existed = targetMap.get(k);
        if (existed) {
          existed.quantity += src.quantity;
          await itemRepo.save(existed);
          await itemRepo.delete(src.id);
        } else {
          await itemRepo.update({ id: src.id }, { order: { id: to.id } as any });
          src.order = to as any;
          targetMap.set(k, src);
          to.items.push(src);
        }
      }

      // 5) Chuyển ticket bếp (nếu có)
      await trx.getRepository(KitchenTicket).update(
        { order: { id: from.id } as any },
        { order: { id: to.id } as any },
      );

      // 6) Cập nhật trạng thái đơn nguồn
      from.status = OrderStatus.MERGED;
      (from as any).mergedInto = to as any; // nếu có cột
      await orderRepo.save(from);

      // 7) Giải phóng bàn nguồn nếu cần
      if (from.table) {
        await trx.getRepository(RestaurantTable).update(
          { id: from.table.id, currentOrder: { id: from.id } as any },
          { currentOrder: null },
        );
      }

      // 8) Lưu lại đơn đích
      await orderRepo.save(to);

      // 9) Bắn socket
      try {
        this.gw.server.to('cashier').emit('orders:merged', {
          fromOrderId: from.id,
          toOrderId: to.id,
          fromTableId: from.table?.id ?? null,
          toTableId: to.table?.id ?? null,
        });
      } catch { }

      // 10) Trả về đơn đích sau ghép
      return await orderRepo.findOne({
        where: { id: to.id },
        relations: ['items', 'items.menuItem', 'table',],
      });
    });
  }



  // tách đơn 
  /**
    * Tách một phần items từ đơn nguồn sang đơn đích.
    * - Nếu mode=create-new: tạo đơn mới ở tableId
    * - Nếu mode=to-existing: chuyển vào toOrderId
    * - Điều kiện: tổng qty còn lại trên đơn nguồn >= 1
    * - Dòng nào còn lại 0 sẽ DELETE (không lưu 0 để tránh vi phạm CHECK)
    */
  /**
   * Tách một phần items từ đơn nguồn sang đơn đích.
   * - mode=create-new: tạo đơn mới ở tableId
   * - mode=to-existing: chuyển vào toOrderId
   * - Điều kiện: tổng qty còn lại của đơn nguồn >= 1
   * - Dòng nào về 0 sẽ DELETE (không lưu 0 để tránh CHECK)
   */
  async splitOrder(fromId: string, dto: SplitOrderDto) {
    const { mode, tableId, toOrderId, items } = dto;

    if (!items?.length) throw new BadRequestException('NO_ITEMS_TO_SPLIT');
    if (mode === 'create-new' && !tableId) throw new BadRequestException('MISSING_TABLE_ID');
    if (mode === 'to-existing' && !toOrderId) throw new BadRequestException('MISSING_TO_ORDER');

    return this.ds.transaction(async (trx) => {
      const orderRepo = trx.getRepository(Order);
      const itemRepo = trx.getRepository(OrderItem);
      const tableRepo = trx.getRepository(RestaurantTable);

      // 1) Khoá base row của đơn nguồn
      await orderRepo.createQueryBuilder('o')
        .where('o.id = :id', { id: fromId })
        .setLock('pessimistic_write')
        .getOneOrFail();

      // 2) Load đơn nguồn (có relations)
      const from = await orderRepo.findOne({
        where: { id: fromId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!from) throw new NotFoundException('SOURCE_ORDER_NOT_FOUND');
      if ([OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.MERGED].includes(from.status)) {
        throw new BadRequestException('SOURCE_ORDER_INVALID_STATUS');
      }

      // 3) Map số lượng tách theo orderItemId
      const want = new Map<string, number>();
      for (const it of items) want.set(it.itemId, it.quantity);

      // 4) Valid không vượt quá từng dòng
      for (const src of from.items ?? []) {
        const q = want.get(src.id) ?? 0;
        if (q < 0) throw new BadRequestException('NEGATIVE_SPLIT');
        if (q > src.quantity) throw new BadRequestException(`SPLIT_EXCEEDS:${src.id}`);
      }

      // 5) Tổng còn lại của đơn nguồn ≥ 1
      const totalRemain = (from.items ?? [])
        .reduce((s, it) => s + (it.quantity - (want.get(it.id) ?? 0)), 0);
      if (totalRemain < 1) throw new BadRequestException('SOURCE_WOULD_BECOME_EMPTY');

      // 6) Lấy/ tạo đơn đích
      let to: Order;
      if (mode === 'to-existing') {
        // khoá
        await orderRepo.createQueryBuilder('o')
          .where('o.id = :id', { id: toOrderId })
          .setLock('pessimistic_write')
          .getOneOrFail();

        to = await orderRepo.findOne({
          where: { id: toOrderId! },
          relations: ['items', 'items.menuItem', 'table'],
        }) as Order;
        if (!to) throw new NotFoundException('TARGET_ORDER_NOT_FOUND');
        if ([OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.MERGED].includes(to.status)) {
          throw new BadRequestException('TARGET_ORDER_INVALID_STATUS');
        }
      } else {
        const tbl = await tableRepo.findOne({ where: { id: tableId! } });
        if (!tbl) throw new NotFoundException('TARGET_TABLE_NOT_FOUND');

        to = await orderRepo.save(orderRepo.create({
          table: tbl,
          status: OrderStatus.PENDING,
          orderType: from.orderType,
        }));
        to.items = [];
      }

      // 7) Map item đích để gộp theo (menuItemId + note)
      const keyOf = (menuItemId: string, note?: string | null) =>
        `${menuItemId}__${(note ?? '').trim()}`;

      const toMap = new Map<string, OrderItem>();
      for (const it of to.items ?? []) {
        toMap.set(keyOf(it.menuItem.id, (it as any).note), it);
      }

      // 8) Thực hiện tách
      for (const src of from.items ?? []) {
        const moveQty = want.get(src.id) ?? 0;
        if (moveQty <= 0) continue;

        const remain = src.quantity - moveQty;

        // 8.1 Giảm ở đơn nguồn: nếu về 0 -> DELETE
        if (remain <= 0) {
          await itemRepo.delete(src.id);
        } else {
          await itemRepo.update({ id: src.id }, { quantity: remain });
        }

        // 8.2 Cộng/gộp sang đơn đích
        const k = keyOf(src.menuItem.id, (src as any).note);
        const existed = toMap.get(k);

        if (existed) {
          await itemRepo.update({ id: existed.id }, { quantity: existed.quantity + moveQty });
          existed.quantity += moveQty;
        } else {
          const partial: DeepPartial<OrderItem> = {
            order: { id: to.id } as any,
            menuItem: { id: src.menuItem.id } as any,
            quantity: moveQty,
            price: src.price,
            status: src.status,
            isCooked: (src as any).isCooked,
            batchId: src.batchId ?? null,  // ⚙️ Giữ nguyên hoặc reset null
            note: (src as any).note,
          };

          const entity = itemRepo.create(partial);     // => OrderItem
          const saved = await itemRepo.save(entity);  // => OrderItem

          toMap.set(k, saved);
          (to.items ??= []).push(saved);
        }
      }

      // 9) (tuỳ chọn) xử lý kitchen tickets nếu có
      // await trx.getRepository(KitchenTicket).update({ order: { id: from.id } }, { order: { id: to.id } });

      // 10) Trả về 2 đơn sau tách
      const [fromAfter, toAfter] = await Promise.all([
        orderRepo.findOne({ where: { id: from.id }, relations: ['items', 'items.menuItem', 'table'] }),
        orderRepo.findOne({ where: { id: to.id }, relations: ['items', 'items.menuItem', 'table'] }),
      ]);

      // (tuỳ chọn) phát socket
      // this.gw.server.to('cashier').emit('orders:split', { fromOrderId: from.id, toOrderId: to.id });

      return { from: fromAfter, to: toAfter };
    });
  }

}
