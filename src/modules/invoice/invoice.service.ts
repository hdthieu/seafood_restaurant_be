// src/modules/invoice/invoice.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { Payment } from 'src/modules/payments/entities/payment.entity';
import { InvoiceStatus, OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Invoice) private invRepo: Repository<Invoice>,
    @InjectRepository(Order)   private orderRepo: Repository<Order>,
    @InjectRepository(Payment) private payRepo: Repository<Payment>,
  ) {}

  /** Tạo invoice từ order (idempotent) */
  async createFromOrder(orderId: string) {
    return this.ds.transaction(async (em) => {
      const oRepo   = em.getRepository(Order);
      const invRepo = em.getRepository(Invoice);

      const order = await oRepo.findOne({
        where: { id: orderId },
        relations: ['items', 'items.menuItem', 'table'],
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      // idempotent
      const existed = await invRepo.findOne({ where: { order: { id: orderId } } });
      if (existed) return existed;

      const total = order.items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);

      const inv = invRepo.create({
        invoiceNumber: await this.genNumber(),
        order: { id: orderId } as any,
        orderId,
        totalAmount: total.toFixed(2),       // decimal -> string
        status: InvoiceStatus.UNPAID,
      });
      return invRepo.save(inv);
    });
  }

  async addPayment(
  invoiceId: string,
  dto: { amount: number; method?: PaymentMethod; txnRef?: string }
) {
  return this.ds.transaction(async (em) => {
    const invRepo = em.getRepository(Invoice);
    const payRepo = em.getRepository(Payment);
    const oRepo   = em.getRepository(Order);

    const inv = await invRepo.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

    const amountNum = Number(dto.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('INVALID_AMOUNT');
    }

    // Map enum bên ngoài -> union type của entity
    
     

    // Tạo bản ghi payment (đã nhận tiền nên status='PAID')
    const payment = payRepo.create({
      invoiceId: inv.id,
      invoice: inv,                // ManyToOne
      amount: amountNum,           // bigint -> number
      method:     dto.method === PaymentMethod.VNPAY ? 'VNPAY' : 'CASH',    // 'CASH' | 'VNPAY'
      status: 'PAID',              // PaymentState
      txnRef: dto.txnRef ?? null,
    } as Partial<Payment>);
    await payRepo.save(payment);

    // Tính tổng đã trả (chỉ tính những payment 'PAID')
    const successPayments = await payRepo.find({
      where: { invoiceId: inv.id, status: 'PAID' },
    });
    const paid = successPayments.reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(inv.totalAmount);

    // Cập nhật trạng thái invoice theo enum InvoiceStatus
    inv.status =
      paid >= total
        ? InvoiceStatus.PAID
        : paid > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.UNPAID;
    await invRepo.save(inv);

    // Nếu invoice đã PAID thì đóng order tương ứng
    if (inv.status === InvoiceStatus.PAID && inv.orderId) {
      const order = await oRepo.findOne({ where: { id: inv.orderId } });
      if (order && order.status !== OrderStatus.PAID) {
        order.status = OrderStatus.PAID;
        await oRepo.save(order);
      }
    }

    return { invoice: inv, payment };
  });
}

  /** Force mark PAID (dùng khi reconcile cổng thanh toán/đối soát) */
  async markPaid(invoiceId: string) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const oRepo   = em.getRepository(Order);

      const inv = await invRepo.findOne({ where: { id: invoiceId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

      inv.status = InvoiceStatus.PAID;
      await invRepo.save(inv);

      if (inv.orderId) {
        await oRepo.update({ id: inv.orderId }, { status: OrderStatus.PAID });
      }
      return inv;
    });
  }

  /** Mã hóa đơn kiểu: INV-YYYYMMDDhhmmss-ABCD */
  private async genNumber() {
    const part = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return `INV-${part}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
}
