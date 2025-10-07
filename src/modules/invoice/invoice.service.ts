// src/modules/invoice/invoice.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { Payment } from 'src/modules/payments/entities/payment.entity';
import { InvoiceStatus, OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';
import { BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { Brackets } from 'typeorm';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Invoice) private invRepo: Repository<Invoice>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Payment) private payRepo: Repository<Payment>,
  ) { }

  /** Tạo invoice từ order (idempotent) */


async createFromOrder(orderId: string, dto?: { customerId?: string | null },guestCount?: number,) {
  return this.ds.transaction(async (em) => {
    const oRepo = em.getRepository(Order);
    const invRepo = em.getRepository(Invoice);

    const order = await oRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'items.menuItem', 'table'],
    });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

    const existed = await invRepo.findOne({ where: { order: { id: orderId } } });
    if (existed) {
      // cho phép cập nhật customer nếu gọi lại
      if (typeof dto?.customerId !== 'undefined') {
        existed.customer = dto.customerId ? ({ id: dto.customerId } as any) : null;
        await invRepo.save(existed);
      }
      return existed;
    }

    const total = order.items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);

    // 👉 Dùng DeepPartial, chỉ cast chỗ quan hệ
    const payload: DeepPartial<Invoice> = {
      invoiceNumber: await this.genNumber(),
      order: { id: orderId } as any,
        guestCount: typeof guestCount === 'number' ? guestCount : null,
      customer: dto?.customerId ? ({ id: dto.customerId } as any) : null,
      totalAmount: total.toFixed(2),
      status: InvoiceStatus.UNPAID,
    };

    const inv = invRepo.create(payload); // trả về Invoice (không phải Invoice[])
    return invRepo.save(inv);
  });
}



 async addPayment(
  invoiceId: string,
  dto: {
    amount: number;
    method?: PaymentMethod;
    txnRef?: string;
    externalTxnId?: string;
    note?: string;
  },
) {
  return this.ds.transaction(async (em) => {
    const invRepo = em.getRepository(Invoice);
    const payRepo = em.getRepository(Payment);
    const oRepo   = em.getRepository(Order);

    // ✅ Load relation 'order' để đóng order khi PAID
    const inv = await invRepo.findOne({
      where: { id: invoiceId },
      relations: ['order'],
    });
    if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

    const amountNum = Math.round(Number(dto.amount || 0));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('INVALID_AMOUNT');
    }

    // Tổng đã trả trước đó
    const successPayments = await payRepo.find({
      where: { invoiceId: inv.id, status: PaymentStatus.SUCCESS },
    });
    const paid  = successPayments.reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(inv.totalAmount);
    const remaining = Math.max(0, total - paid);

    // Nếu đã đủ tiền rồi thì chặn
    if (remaining <= 0) {
      throw new BadRequestException('INVOICE_ALREADY_PAID');
    }

    // ⭐ Co tiền về đúng phần còn thiếu (thay vì throw OVERPAY_NOT_ALLOWED)
    const take = Math.min(amountNum, remaining);
    if (take <= 0) {
      throw new BadRequestException('INVALID_AMOUNT');
    }

    const method = dto.method ?? PaymentMethod.CASH;

    // Ghi payment thành công ngay (SUCCESS)
    const payment = payRepo.create({
      invoiceId: inv.id,
      invoice: inv,
      amount: take, // ⭐ chỉ ghi số tiền đã co
      method,
      status: PaymentStatus.SUCCESS,
      txnRef: dto.txnRef ?? null,
      externalTxnId: dto.externalTxnId ?? null,
      note: dto.note ?? null,
    } as Partial<Payment>);
    await payRepo.save(payment);

    // Cập nhật trạng thái invoice
    const paidAfter = paid + take;
    inv.status =
      paidAfter >= total
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIAL;
    await invRepo.save(inv);

    // Nếu đã PAID thì đóng Order
    if (inv.status === InvoiceStatus.PAID && inv.order?.id) {
      await oRepo.update({ id: inv.order.id }, { status: OrderStatus.PAID });
    }

    return { invoice: inv, payment };
  });
}

  /** Force mark PAID (dùng khi reconcile cổng thanh toán/đối soát) */
  async markPaid(invoiceId: string) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const oRepo = em.getRepository(Order);

      const inv = await invRepo.findOne({ where: { id: invoiceId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

      inv.status = InvoiceStatus.PAID;
      await invRepo.save(inv);

      if (inv.order.id) {
        await oRepo.update({ id: inv.order.id }, { status: OrderStatus.PAID });
      }
      return inv;
    });
  }

  // /** Mã hóa đơn kiểu: INV-YYYYMMDDhhmmss-ABCD */
  // private async genNumber() {
  //   const part = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  //   return `INV-${part}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  // }

 /** Danh sách hóa đơn + tổng đã trả (CASH/VNPAY), còn thiếu */
  async list(q: QueryInvoicesDto) {
    const qb = this.invRepo.createQueryBuilder('i')
      .leftJoinAndSelect('i.order', 'o')
      .leftJoinAndSelect('o.table', 't')
      .leftJoinAndSelect('i.customer', 'c')
      .leftJoinAndSelect('i.payments', 'p'); // lấy để tính paid

    if (q.q) {
      const s = `%${q.q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w => {
        w.where('LOWER(i.invoiceNumber) LIKE :s', { s })
         .orWhere('LOWER(c.name) LIKE :s', { s })
         .orWhere('LOWER(t.name) LIKE :s', { s });
      }));
    }
    if (q.status) qb.andWhere('i.status = :st', { st: q.status });

    if (q.fromDate) qb.andWhere('i.createdAt >= :from', { from: new Date(q.fromDate) });
    if (q.toDate) {
      const to = new Date(q.toDate); to.setHours(23,59,59,999);
      qb.andWhere('i.createdAt <= :to', { to });
    }

    qb.orderBy('i.createdAt', 'DESC').addOrderBy('i.invoiceNumber', 'DESC');
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // Tính tổng đã trả theo phương thức
    const items = rows.map((inv) => {
      const paidCash = (inv.payments ?? [])
        .filter(x => x.status === PaymentStatus.SUCCESS && x.method === PaymentMethod.CASH)
        .reduce((s, p) => s + Number(p.amount), 0);

      const paidBank = (inv.payments ?? [])
        .filter(x => x.status === PaymentStatus.SUCCESS && x.method === PaymentMethod.VNPAY)
        .reduce((s, p) => s + Number(p.amount), 0);

      const paidTotal = paidCash + paidBank;
      const totalAmount = Number(inv.totalAmount);
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        createdAt: inv.createdAt,
        status: inv.status,
        table: inv.order?.table ? { id: inv.order.table.id, name: inv.order.table.name } : null,
        customer: inv.customer ? { id: inv.customer.id, name: inv.customer.name } : null,
        guestCount: inv.guestCount ?? null,
        totalAmount,
        paidCash,
        paidBank,
        paidTotal,
        remaining: Math.max(0, totalAmount - paidTotal),
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Chi tiết hóa đơn: items + payments */
  async detail(id: string) {
    const inv = await this.invRepo.findOne({
      where: { id },
      relations: [
        'order',
        'order.items',
        'order.items.menuItem',
        'order.table',
        'customer',
        'payments',
      ],
    });
    if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

    const lines = (inv.order?.items ?? []).map(it => ({
      id: it.id,
      menuItemId: it.menuItem?.id,
      name: it.menuItem?.name,
      qty: it.quantity,
      unitPrice: Number(it.price),
      lineTotal: Number(it.price) * it.quantity,
    }));

    const paidCash = (inv.payments ?? [])
      .filter(x => x.status === PaymentStatus.SUCCESS && x.method === PaymentMethod.CASH)
      .reduce((s, p) => s + Number(p.amount), 0);

    const paidBank = (inv.payments ?? [])
      .filter(x => x.status === PaymentStatus.SUCCESS && x.method === PaymentMethod.VNPAY)
      .reduce((s, p) => s + Number(p.amount), 0);

    const paidTotal = paidCash + paidBank;
    const totalAmount = Number(inv.totalAmount);

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      createdAt: inv.createdAt,
      status: inv.status,
      table: inv.order?.table ? { id: inv.order.table.id, name: inv.order.table.name } : null,
      customer: inv.customer ? { id: inv.customer.id, name: inv.customer.name, phone: inv.customer.phone } : null,
      guestCount: inv.guestCount ?? null,
      items: lines,
      payments: (inv.payments ?? []).map(p => ({
        id: p.id,
        method: p.method,   // 'CASH' | 'VNPAY'
        status: p.status,   // 'PAID' | ...
        amount: Number(p.amount),
        txnRef: p.txnRef,
        createdAt: p.createdAt,
      })),
      totalAmount,
      paidCash,
      paidBank,
      paidTotal,
      remaining: Math.max(0, totalAmount - paidTotal),
    };
  }

  /* ==== các method createFromOrder, addPayment, markPaid của bạn giữ nguyên ==== */

  /** Mã HĐ: INV-yyyymmddhhMMss-XXXX (đã có) */
  private async genNumber() {
    const part = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return `INV-${part}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }










}
