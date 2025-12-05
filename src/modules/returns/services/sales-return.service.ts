import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { OrderItem } from 'src/modules/orderitems/entities/orderitem.entity';
import { SalesReturn } from '../entities/sales-return.entity';
import { SalesReturnItem } from '../entities/sale-return-item.enity';
import { CreateSalesReturnDto } from '../dto/create-sales-return.dto';
import {
  InvoiceStatus,
  SalesReturnStatus,
  SalesReturnType,
  CashbookType,
  CounterpartyGroup,
} from 'src/common/enums';
import { User } from 'src/modules/user/entities/user.entity';
import { CashbookEntry } from 'src/modules/cashbook/entities/cashbook.entity';
import { CashType } from 'src/modules/cashbook/entities/cash_types.entity';
import { Ingredient } from 'src/modules/ingredient/entities/ingredient.entity';
import { InventoryItem } from 'src/modules/inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from 'src/modules/inventorytransaction/entities/inventorytransaction.entity';
import { In } from 'typeorm';
import { getConversionFactorRecursive } from 'src/common/utils/uom.util';
import { InventoryAction } from 'src/common/enums'; 
import { UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/common';
@Injectable()
export class SalesReturnService {
  constructor(private readonly ds: DataSource) {}

async getDetail(id: string) {
  const repo = this.ds.getRepository(SalesReturn);

  const ret = await repo.findOne({
    where: { id },
    relations: [
      'invoice',
      'invoice.order',
      'invoice.order.table',
      'customer',
      'cashier',
      'cashier.profile',      // 👈 thêm profile
      'items',
      'items.menuItem',
    ],
  });

  if (!ret) throw new NotFoundException('RETURN_NOT_FOUND');

  const cashier: any = ret.cashier;
  const profile = cashier?.profile;

  const cashierName =
    profile?.fullName ??
    profile?.full_name ??   // tuỳ bạn đặt trong entity
    cashier?.username ??
    null;

  return {
    id: ret.id,
    returnNumber: ret.returnNumber,
    note: ret.note,
    refundMethod: ret.refundMethod,
    goodsAmount: Number(ret.goodsAmount ?? 0),
    discountAmount: Number(ret.discountAmount ?? 0),
    refundAmount: Number(ret.refundAmount ?? 0),
    createdAt: ret.createdAt,

    // 👇 trả thẳng ra ngoài đúng shape FE đang dùng
    invoiceId: ret.invoice?.id ?? null,
    invoiceNumber: ret.invoice?.invoiceNumber ?? null,
    tableName: ret.invoice?.order?.table?.name ?? null,

    customerName: ret.customer?.name ?? 'Khách lẻ',
    cashierName, // 👈 đã tính ở trên

    items: (ret.items ?? []).map((it) => ({
      id: it.id,
      menuItemName: it.menuItem?.name ?? '',
      qty: it.qty,
      unitPrice: Number(it.unitPrice ?? 0),
      lineAmount: Number(it.lineAmount ?? 0),
      reason: it.reason ?? null,
    })),
  };
}


async list(opts: {
  search?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { search, from, to, page, limit } = opts;
  const repo = this.ds.getRepository(SalesReturn);

  const qb = repo
    .createQueryBuilder('r')
    .leftJoinAndSelect('r.invoice', 'inv')
    .leftJoinAndSelect('r.customer', 'c')
    .leftJoinAndSelect('r.cashier', 'u')
    .leftJoinAndSelect('u.profile', 'p')   // 👈 join profile
    .orderBy('r.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  if (from) qb.andWhere('r.createdAt >= :from', { from });
  if (to) qb.andWhere('r.createdAt <= :to', { to });

  if (search && search.trim()) {
    qb.andWhere(
      `(r.returnNumber ILIKE :q
        OR inv.invoiceNumber ILIKE :q
        OR c.name ILIKE :q
        OR p.full_name ILIKE :q
        OR p.fullName ILIKE :q
        OR u.username ILIKE :q)`,
      { q: `%${search.trim()}%` },
    );
  }

  const [rows, total] = await qb.getManyAndCount();

  return {
    data: rows.map((r: any) => {
      const cashier = r.cashier;
      const profile = cashier?.profile;
      const cashierName =
        profile?.fullName ??
        profile?.full_name ??
        cashier?.username ??
        null;

      return {
        id: r.id,
        returnNumber: r.returnNumber,
        createdAt: r.createdAt,
        status: r.status,
        refundMethod: r.refundMethod,
        goodsAmount: Number(r.goodsAmount ?? 0),
        discountAmount: Number(r.discountAmount ?? 0),
        refundAmount: Number(r.refundAmount ?? 0),
        invoiceId: r.invoice?.id ?? null,
        invoiceNumber: r.invoice?.invoiceNumber ?? null,
        customerName: r.customer?.name ?? null,
        cashierName, // 👈
      };
    }),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}


  /* ========== 1. LIST HÓA ĐƠN CÓ THỂ TRẢ ========== */
  async listReturnableInvoices(opts: {
    search?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    const { search, from, to, page, limit } = opts;
    const repo = this.ds.getRepository(Invoice);

    const qb = repo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.order', 'o')
      .leftJoinAndSelect('o.table', 'tbl')
      .leftJoinAndSelect('inv.customer', 'c')
      .where('inv.status = :st', { st: InvoiceStatus.PAID });

    if (from) {
      qb.andWhere('inv.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('inv.createdAt <= :to', { to });
    }
    if (search && search.trim()) {
      qb.andWhere(
        `(inv.invoiceNumber ILIKE :q OR c.name ILIKE :q OR tbl.name ILIKE :q)`,
        { q: `%${search.trim()}%` },
      );
    }

    qb.orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        createdAt: inv.createdAt,
        totalAmount: Number(inv.totalAmount ?? 0),
        finalAmount: Number(inv.finalAmount ?? 0),
        discountTotal: Number(inv.discountTotal ?? 0),
        tableName: inv.order?.table?.name ?? null,
        customerName: inv.customer?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  /* ========== 2. SUMMARY 1 HÓA ĐƠN ĐỂ CHỌN MÓN TRẢ ========== */
  async getInvoiceReturnSummary(invoiceId: string) {
    const invRepo = this.ds.getRepository(Invoice);
    const orderItemRepo = this.ds.getRepository(OrderItem);
    const returnItemRepo = this.ds.getRepository(SalesReturnItem);

    const invoice = await invRepo.findOne({
      where: { id: invoiceId },
      relations: ['order', 'order.table', 'customer'],
    });
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');

    const orderItems = await orderItemRepo.find({
      where: { order: { id: invoice.order.id } as any },
      relations: ['menuItem'],
    });

    const existingReturnItems = await returnItemRepo.find({
      where: { return: { invoice: { id: invoice.id } as any } as any },
      relations: ['orderItem'],
    });

    const returnedMap = new Map<string, number>();
    for (const ri of existingReturnItems) {
      const k = ri.orderItem.id;
      returnedMap.set(k, (returnedMap.get(k) ?? 0) + ri.qty);
    }

    const items = orderItems.map((oi) => {
      const soldQty = oi.quantity;
      const returnedQty = returnedMap.get(oi.id) ?? 0;
      const remainQty = Math.max(0, soldQty - returnedQty);
      const unitPrice = Number(oi.price ?? 0);

      return {
        orderItemId: oi.id,
        menuItemId: oi.menuItem.id,
        name: oi.menuItem.name,
        unitPrice,
        soldQty,
        returnedQty,
        remainQty,
      };
    });

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        createdAt: invoice.createdAt,
        tableName: invoice.order?.table?.name ?? null,
        customerName: invoice.customer?.name ?? null,
        totalAmount: Number(invoice.totalAmount ?? 0),
        discountTotal: Number(invoice.discountTotal ?? 0),
        finalAmount: Number(invoice.finalAmount ?? 0),
      },
      items,
    };
  }

  /* ========== 3. TẠO PHIẾU TRẢ + PHIẾU CHI HOÀN TIỀN ========== */
 async create(dto: CreateSalesReturnDto, cashier: User) {
  return this.ds.transaction(async (em) => {
    const invRepo = em.getRepository(Invoice);
    const orderItemRepo = em.getRepository(OrderItem);
    const returnRepo = em.getRepository(SalesReturn);
    const returnItemRepo = em.getRepository(SalesReturnItem);
    const cashbookRepo = em.getRepository(CashbookEntry);
    const cashTypeRepo = em.getRepository(CashType);

    const invoice = await invRepo.findOne({
      where: { id: dto.invoiceId },
      relations: ['order', 'customer'],
    });
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');

    const orderItems = await orderItemRepo.find({
      where: { order: { id: invoice.order.id } as any },
      relations: ['menuItem'],
    });

    const existingReturnItems = await returnItemRepo.find({
      where: { return: { invoice: { id: invoice.id } as any } as any },
      relations: ['orderItem'],
    });

    const alreadyReturned = new Map<string, number>();
    for (const ri of existingReturnItems) {
      const k = ri.orderItem.id;
      alreadyReturned.set(k, (alreadyReturned.get(k) ?? 0) + ri.qty);
    }

    let goodsAmount = 0;
    const itemsToSave: SalesReturnItem[] = [];

    for (const row of dto.items) {
      const oi = orderItems.find((x) => x.id === row.orderItemId);
      if (!oi) continue;

      const soldQty = oi.quantity;
      const returnedQty = alreadyReturned.get(oi.id) ?? 0;
      const remain = soldQty - returnedQty;
      const qty = Math.min(row.qty, remain);
      if (qty <= 0) continue;

      const unitPrice = Number(oi.price ?? 0);
      const lineAmount = unitPrice * qty;
      goodsAmount += lineAmount;

      const ri = returnItemRepo.create({
        orderItem: oi,
        menuItem: oi.menuItem,
        qty,
        unitPrice,
        lineAmount,
        reason: row.reason?.trim() || null,
      });
      itemsToSave.push(ri);
    }

    if (!itemsToSave.length) {
      throw new BadRequestException('NO_ITEMS_TO_RETURN');
    }

    const discountAmount = 0;
    const refundAmount = goodsAmount - discountAmount;

    // 1) Phiếu trả hàng
    const ret = returnRepo.create({
      returnNumber: await this.genReturnNumber(em),
      invoice,
      order: invoice.order,
      type:
        goodsAmount === Number(invoice.totalAmount)
          ? SalesReturnType.FULL
          : SalesReturnType.PARTIAL,
      status: SalesReturnStatus.COMPLETED,
      goodsAmount: goodsAmount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      refundAmount: refundAmount.toFixed(2),
      refundMethod: dto.refundMethod,       // CASH / BANK_TRANSFER / CARD
      customer: invoice.customer ?? null,
      cashier: cashier ? ({ id: cashier.id } as any) : null,
      note: dto.note ?? null,
    });

    await returnRepo.save(ret);

    for (const ri of itemsToSave) {
      ri.return = ret;
    }
    await returnItemRepo.save(itemsToSave);
      await this.restoreInventoryForSalesReturn(em, itemsToSave, ret.id);

    // 2) Phiếu chi hoàn tiền
    if (refundAmount > 0) {
      // TÊN cash_type CỐ ĐỊNH cho nghiệp vụ này
      const REFUND_CASH_TYPE_NAME = 'Chi tiền hoàn trả khách';

      const cashType = await cashTypeRepo.findOne({
        where: { name: REFUND_CASH_TYPE_NAME },
      });

      if (!cashType) {
        throw new BadRequestException(
          `CASH_TYPE_NOT_CONFIGURED: ${REFUND_CASH_TYPE_NAME} chưa được tạo trong cash_types`,
        );
      }

      const cbCode = await this.genCashbookCode(em);

      const cb = cashbookRepo.create({
        type: CashbookType.PAYMENT,
        code: cbCode,
        date: new Date(),
        cashType,
        amount: refundAmount.toFixed(2),
        counterpartyGroup: CounterpartyGroup.CUSTOMER,

        customer: invoice.customer ?? null,
        supplier: null,
        cashOtherParty: null,

        invoice,
        purchaseReceipt: null,
        purchaseReturn: null,
        sourceCode: ret.returnNumber, // link ngược về phiếu trả

        staff: cashier ?? null,
      });

      await cashbookRepo.save(cb);
    }

    return ret;
  });
}



  /* ========== GEN SỐ PHIẾU TRẢ ========== */
  private async genReturnNumber(em: EntityManager): Promise<string> {
    const repo = em.getRepository(SalesReturn);

    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');

    const prefix = `RT${yyyy}${mm}${dd}`;

    const last = await repo
      .createQueryBuilder('r')
      .where('r.returnNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('r.returnNumber', 'DESC')
      .getOne();

    let nextSeq = 1;
    if (last?.returnNumber) {
      const suffix = last.returnNumber.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!isNaN(n)) nextSeq = n + 1;
    }

    const returnNumber = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    return returnNumber;
  }

  /* ========== GEN MÃ PHIẾU THU/CHI DẠNG PC-yyyymmddHHMMSS-XXXX ========== */

  private genCode(prefix: 'PT' | 'PC') {
    const d = new Date();

    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');

    const timestamp = `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();

    return `${prefix}-${timestamp}-${rand}`;
  }

  private async genCashbookCode(em: EntityManager): Promise<string> {
    const repo = em.getRepository(CashbookEntry);

    // loop cho chắc chắn không trùng
    // (tỷ lệ trùng đã rất thấp nhưng vẫn check)
    // prefix 'PC' = Phiếu chi
    let code: string;
    let exists = true;

    do {
      code = this.genCode('PC');
      exists = await repo.exist({ where: { code } as any });
    } while (exists);

    return code;
  }


    /**
   * Hoàn kho khi khách trả hàng.
   * Tính theo cùng công thức trừ kho khi order:
   *  - Ưu tiên ing.quantity (số lượng theo baseUom / 1 món)
   *  - Nếu không có, dùng selectedQty + selectedUom và convert sang baseUom
   */
  private async restoreInventoryForSalesReturn(
    em: EntityManager,
    items: SalesReturnItem[],
    salesReturnId: string,
  ) {
    if (!items.length) return;

    // Gom tổng số lượng trả theo menuItem
    const menuQtyMap = new Map<string, number>(); // menuItemId -> total returned qty
    for (const it of items) {
      const menuId = (it.menuItem as any).id;
      const cur = menuQtyMap.get(menuId) ?? 0;
      menuQtyMap.set(menuId, cur + Number(it.qty || 0));
    }

    const menuIds = Array.from(menuQtyMap.keys());
    if (!menuIds.length) return;

    // Load nguyên liệu của các món đó (kèm baseUom + selectedUom để convert)
    const ingRepo = em.getRepository(Ingredient);
    const ings = await ingRepo.find({
      where: { menuItem: { id: In(menuIds) } as any },
      relations: ['inventoryItem', 'inventoryItem.baseUom', 'menuItem', 'selectedUom'],
    });

    // inventoryItemId -> qty cần cộng lại (ở đơn vị baseUom)
    const backMap = new Map<string, number>();

    for (const ing of ings) {
      const menuId = (ing.menuItem as any).id;
      const returnedMenuQty = menuQtyMap.get(menuId) ?? 0;
      if (returnedMenuQty <= 0) continue;

      let basePerMenu = Number(ing.quantity || 0);

      // Nếu không có quantity baseUom → convert từ selectedUom
      if (!basePerMenu || basePerMenu <= 0) {
        if (
          ing.selectedUom &&
          ing.selectedQty &&
          ing.inventoryItem &&
          ing.inventoryItem.baseUom
        ) {
          const fromCode = (ing.selectedUom as any).code;
          const toCode = (ing.inventoryItem.baseUom as any).code;
          const factor = await getConversionFactorRecursive(em, fromCode, toCode);
          if (!factor || factor <= 0) {
            throw new BadRequestException(
              `NO_CONVERSION_DEFINED_FOR_INGREDIENT:${ing.id}`,
            );
          }
          basePerMenu = Number(ing.selectedQty) * factor;
        } else {
          basePerMenu = 0;
        }
      }

      const delta = basePerMenu * returnedMenuQty;
      if (delta <= 0) continue;

      const invId = (ing.inventoryItem as any).id;
      backMap.set(invId, (backMap.get(invId) ?? 0) + delta);
    }

    await this.applyInventoryDeltaForReturn(
      em,
      backMap,
      InventoryAction.IN,
      'SALES_RETURN',
      salesReturnId,
    );
  }

  /**
   * Áp delta kho (IN) cho phiếu trả hàng + log InventoryTransaction.
   * (Không cần validate tồn vì là nhập lại kho)
   */
  private async applyInventoryDeltaForReturn(
    em: EntityManager,
    deltaMap: Map<string, number>,
    action: InventoryAction,
    refType: string,
    refId: string,
  ) {
    if (!deltaMap.size) return;

    const ids = Array.from(deltaMap.keys());
    const invRepo = em.getRepository(InventoryItem);
    const txRepo = em.getRepository(InventoryTransaction);

    const items = await invRepo.find({ where: { id: In(ids) } as any });

    for (const it of items) {
      const delta = deltaMap.get(it.id)!;
      const before = Number(it.quantity);
      const after =
        action === InventoryAction.OUT ? before - delta : before + delta;

      it.quantity = after as any;
      await invRepo.save(it);

      await txRepo.save(
        txRepo.create({
          item: { id: it.id } as any,
          quantity: delta,
          action,
          beforeQty: before,
          afterQty: after,
          refType,
          refId,
          note:
            action === InventoryAction.OUT
              ? 'Consume by SALES_RETURN'
              : 'Restore by SALES_RETURN',
        }),
      );
    }
  }

}
