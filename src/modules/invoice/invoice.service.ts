// src/modules/invoice/invoice.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { Payment } from 'src/modules/payments/entities/payment.entity';
import { ApplyWith, DiscountTypePromotion, InvoiceStatus, OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';
import { BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { Brackets } from 'typeorm';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { CashbookService } from '@modules/cashbook/cashbook.service';
import { InvoicePromotion } from '@modules/promotions/entities/invoicepromotion.entity';
import { Promotion } from '@modules/promotions/entities/promotion.entity';
import { ApplyPromotionsDto } from './dto/apply-promotions.dto';
import {PaymentsGateway} from '@modules/payments/payments.gateway';
import { KitchenGateway } from '@modules/socket/kitchen.gateway';
@Injectable()
export class InvoicesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Invoice) private invRepo: Repository<Invoice>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Payment) private payRepo: Repository<Payment>,
    private readonly cashbookService: CashbookService,
    @InjectRepository(InvoicePromotion) private invPromoRepo: Repository<InvoicePromotion>,
     private readonly gateway: PaymentsGateway, 
      private readonly kitchenGateway: KitchenGateway, 
  ) { }

  /** Tạo invoice từ order (idempotent) */


  async createFromOrder(
  orderId: string,
  body: { customerId?: string | null; guestCount?: number } = {},
  userId?: string,
) {
  return this.ds.transaction(async (em) => {
    const oRepo = em.getRepository(Order);
    const invRepo = em.getRepository(Invoice);

    const order = await oRepo.findOne({
      where: { id: orderId },
      relations: [
        'items',
        'items.menuItem',
        'items.menuItem.category',
        'table',
        'customer',
      ],
    });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

    const calcTotalFromOrder = () =>
      (order.items ?? []).reduce(
        (s, it) => s + Number(it.price ?? 0) * Number(it.quantity ?? 0),
        0,
      );

    // ---- canonical: ưu tiên body, fallback order ----
    const canonicalCustomerId =
      (body.customerId !== undefined ? body.customerId : order.customer?.id) ?? null;

    const canonicalGuestCountRaw =
      body.guestCount !== undefined && body.guestCount !== null
        ? body.guestCount
        : (order as any).guestCount ?? null;

    const canonicalGuestCount =
      canonicalGuestCountRaw === null || canonicalGuestCountRaw === undefined || canonicalGuestCountRaw === ''
        ? null
        : Number(canonicalGuestCountRaw);

    // 2) Đã có invoice -> chỉ cập nhật nhẹ, KHÔNG autoApply/recompute
    let existed = await invRepo.findOne({
      where: { order: { id: orderId } },
      relations: [
        'order',
        'order.items',
        'order.items.menuItem',
        'order.items.menuItem.category',
        'order.table',
        'customer',
        'payments',
        'invoicePromotions',
        'invoicePromotions.promotion',
      ],
    });

    if (existed) {
      let touched = false;

      if (existed.status === InvoiceStatus.UNPAID) {
        existed.customer = canonicalCustomerId
          ? ({ id: canonicalCustomerId } as any)
          : null;
        existed.guestCount =
          typeof canonicalGuestCount === 'number' ? canonicalGuestCount : null;
        touched = true;

        // Đồng bộ totalAmount theo Order nếu cần
        const total = calcTotalFromOrder();
        if (Number(existed.totalAmount) !== total) {
          existed.totalAmount = total.toFixed(2) as any;
          touched = true;
        }
      }

      if (!existed.cashier && userId) {
        existed.cashier = { id: userId } as any;
        touched = true;
      }

      if (touched) {
        existed = await invRepo.save(existed);
      }

      // ❌ KHÔNG gọi autoApplyPromotions/recompute ở đây nữa

      const full = await invRepo.findOne({
        where: { id: existed.id },
        relations: [
          'order',
          'order.items',
          'order.items.menuItem',
          'order.items.menuItem.category',
          'order.table',
          'customer',
          'payments',
          'invoicePromotions',
          'invoicePromotions.promotion',
        ],
      });
      return full!;
    }

    // 3) Chưa có invoice -> tạo mới + auto apply
    const total = calcTotalFromOrder();
    const payload: DeepPartial<Invoice> = {
      invoiceNumber: await this.genNumber(),
      order: { id: orderId } as any,
      guestCount:
        typeof canonicalGuestCount === 'number' ? canonicalGuestCount : null,
      customer: canonicalCustomerId
        ? ({ id: canonicalCustomerId } as any)
        : null,
      totalAmount: total.toFixed(2),
      discountTotal: '0',
      finalAmount: total.toFixed(2),
      status: InvoiceStatus.UNPAID,
      cashier: userId ? ({ id: userId } as any) : null,
    };

    const created = await invRepo.save(invRepo.create(payload));

    // Chỉ auto apply lần đầu
    await this.autoApplyPromotions(em, created.id);
    await this.recomputeInvoiceTotals(em, created.id);

    const full = await invRepo.findOne({
      where: { id: created.id },
      relations: [
        'order',
        'order.items',
        'order.items.menuItem',
        'order.items.menuItem.category',
        'order.table',
        'customer',
        'payments',
        'invoicePromotions',
        'invoicePromotions.promotion',
      ],
    });
    return full!;
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
      const oRepo = em.getRepository(Order);

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
      const paid = successPayments.reduce((s, p) => s + Number(p.amount), 0);
      const gross = Number(inv.totalAmount);
      const net = Number(inv.finalAmount ?? 0) || gross - Number(inv.discountTotal ?? 0);
      const totalToPay = Math.max(0, net);
      const remaining = Math.max(0, totalToPay - paid);
      const total = Number(inv.finalAmount ?? inv.totalAmount ?? 0);
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
      const still = Math.max(0, total - paidAfter);
      inv.status = paidAfter >= totalToPay ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
      await invRepo.save(inv);

      // Nếu đã PAID thì đóng Order
      if (inv.status === InvoiceStatus.PAID && inv.order?.id) {
        await oRepo.update({ id: inv.order.id }, { status: OrderStatus.PAID });
         this.kitchenGateway.emitOrderChanged({
        orderId: inv.order.id,
        tableId: inv.order.table?.id || '',
        reason: 'ORDER_STATUS', 
      });
      }

      // Ghi vào sổ quỹ đã thu: áp dụng cho CASH, VIETQR, VNPAY, CARD
      if ([PaymentMethod.CASH, PaymentMethod.VIETQR,].includes(method)) {
        await this.cashbookService.postReceiptFromInvoice(em, inv, take);
      }
      if (still <= 0) {
        this.gateway.emitPaid(inv.id, { invoiceId: inv.id, amount: take, method: 'CASH_OR_PAYOS' });
      } else {
        this.gateway.emitPartial(inv.id, { invoiceId: inv.id, amount: take, remaining: still });
      }

      return { invoice: inv, payment };
    });
  }

  /** Force mark PAID (dùng khi reconcile cổng thanh toán/đối soát) */
  async markPaid(invoiceId: string) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const oRepo = em.getRepository(Order);

      const inv = await invRepo.findOne({ where: { id: invoiceId }, relations: ['order'] });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');

      inv.status = InvoiceStatus.PAID;
      await invRepo.save(inv);

      if (inv.order?.id) {
        await oRepo.update({ id: inv.order.id }, { status: OrderStatus.PAID });
         this.kitchenGateway.emitOrderChanged({
        orderId: inv.order.id,
        tableId: inv.order.table?.id || '',
        reason: 'ORDER_STATUS',
      });
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
    try {
      const qb = this.invRepo.createQueryBuilder('i')
        .distinct(true)
        .leftJoinAndSelect('i.order', 'o')
        .leftJoinAndSelect('o.table', 't')
        .leftJoinAndSelect('t.area', 'a')
        .leftJoinAndSelect('i.customer', 'c')
        .leftJoinAndSelect('i.payments', 'p')
        .leftJoinAndSelect('i.cashier', 'cashier')
        .leftJoinAndSelect('cashier.profile', 'cashierProfile');

      // ===== SEARCH =====
      if (q.q?.trim()) {
        const raw = q.q.trim().toLowerCase();
        const s = `%${raw}%`;

        qb.andWhere(new Brackets(w => {
          w.where("LOWER(i.invoiceNumber) LIKE :s", { s })
            .orWhere("LOWER(COALESCE(c.name, '')) LIKE :s", { s })
            .orWhere("LOWER(COALESCE(c.\"phoneNumber\", '')) LIKE :s", { s })
            .orWhere("LOWER(COALESCE(i.note, '')) LIKE :s", { s })
            .orWhere("LOWER(COALESCE(t.name, '')) LIKE :s", { s });

          // ⭐ Nếu người dùng gõ 'khách lẻ' / 'khach le' thì match customer null
          if (raw === "khách lẻ" || raw === "khach le") {
            // tuỳ cột khóa ngoại của bạn, thường là i."customerId" IS NULL
            w.orWhere('i."customerId" IS NULL');
          }
        }));
      }


      // ===== FILTER STATUS =====
      if (q.status) qb.andWhere("i.status = :st", { st: q.status });

      // ===== FILTER PAYMENT METHOD =====
      if (q.paymentMethod) {
        qb.andWhere("p.method = :pm", { pm: q.paymentMethod });
      }

      // ===== FILTER TABLE / AREA =====
      if (q.tableId) qb.andWhere("t.id = :tid", { tid: q.tableId });
      if (q.areaId) qb.andWhere("a.id = :aid", { aid: q.areaId });

      // ===== DATE RANGE =====
      if (q.fromDate) qb.andWhere("i.createdAt >= :from", { from: new Date(q.fromDate) });
      if (q.toDate) {
        const to = new Date(q.toDate);
        to.setHours(23, 59, 59, 999);
        qb.andWhere("i.createdAt <= :to", { to });
      }

      qb.orderBy("i.createdAt", "DESC");

      const page = q.page ?? 1;
      const limit = q.limit ?? 20;
      qb.skip((page - 1) * limit).take(limit);

      const [rows, total] = await qb.getManyAndCount();

      // ===== MAP RESULT =====
      const items = rows.map(inv => {
        const paidCash = (inv.payments ?? [])
          .filter(p => p.status === PaymentStatus.SUCCESS && p.method === PaymentMethod.CASH)
          .reduce((s, p) => s + Number(p.amount), 0);

        const paidBank = (inv.payments ?? [])
          .filter(p => p.status === PaymentStatus.SUCCESS && p.method === PaymentMethod.VIETQR)
          .reduce((s, p) => s + Number(p.amount), 0);

        const paidTotal = paidCash + paidBank;

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          createdAt: inv.createdAt,
          status: inv.status,
          table: inv.order?.table
            ? { id: inv.order.table.id, name: inv.order.table.name }
            : null,
          area: inv.order?.table?.area
            ? { id: inv.order.table.area.id, name: inv.order.table.area.name }
            : null,
          customer: inv.customer
            ? { id: inv.customer.id, name: inv.customer.name }
            : null,
          totalAmount: Number(inv.totalAmount),
          discountTotal: Number(inv.discountTotal ?? 0),
          finalAmount: Number(inv.finalAmount ?? 0),
          paidCash,
          paidBank,
          paidTotal,
          remaining: Math.max(0, Number(inv.finalAmount ?? 0) - paidTotal),
          cashier: inv.cashier
            ? { id: inv.cashier.id, name: inv.cashier.profile.fullName }
            : null,
        };
      });

      return new ResponseCommon(
        200,
        true,
        "Lấy danh sách hóa đơn thành công",
        items,
        {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }
      );
    } catch (e) {
      throw new ResponseException(e, 500, "Không thể lấy danh sách hóa đơn");
    }
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
        'invoicePromotions',
        'invoicePromotions.promotion',
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
      .filter(x => x.status === PaymentStatus.SUCCESS && x.method === PaymentMethod.VIETQR)
      .reduce((s, p) => s + Number(p.amount), 0);

    const paidTotal = paidCash + paidBank;
    const totalAmount = Number(inv.totalAmount);
    const discountTotal = Number(inv.discountTotal ?? 0);
    const finalAmount = Number(inv.finalAmount ?? (totalAmount - discountTotal));
    const promoNames =
      (inv.invoicePromotions ?? [])
        .map(ip => ip.promotion?.name || ip.codeUsed)
        .filter(Boolean);
    const promotionName = promoNames.length ? promoNames.join(' + ') : null;
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
        method: p.method,
        status: p.status,
        amount: Number(p.amount),
        txnRef: p.txnRef,
        createdAt: p.createdAt,
      })),
      totalAmount,
      discountTotal,
      finalAmount,
      paidCash,
      paidBank,
      paidTotal,
      remaining: Math.max(0, finalAmount - paidTotal),
      promotionName,
    };
  }


  async applyPromotions(invoiceId: string, dto: ApplyPromotionsDto = {}) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const ipRepo = em.getRepository(InvoicePromotion);
      const promoRepo = em.getRepository(Promotion);

      const inv = await invRepo.findOne({
        where: { id: invoiceId },
        relations: [
          'order',
          'order.items',
          'order.items.menuItem',
          'order.items.menuItem.category',
          'invoicePromotions',
          'invoicePromotions.promotion',
        ],
      });
      if (!inv) throw new ResponseException(null, 404, 'INVOICE_NOT_FOUND');
      if (inv.status !== InvoiceStatus.UNPAID) {
        throw new ResponseException(null, 400, 'CANNOT_APPLY_PROMOTION_TO_PAID_INVOICE');
      }

      // ===== Chuẩn hoá input
      const codes = [
        ...(dto.codes ?? []),
        ...(dto.promotionCode ? [dto.promotionCode] : []),
      ].map(s => (s || '').trim()).filter(Boolean);

      const ids = [
        ...(dto.ids ?? []),
        ...(dto.promotionId ? [dto.promotionId] : []),
      ].map(s => (s || '').trim()).filter(Boolean);

      if (!codes.length && !ids.length) {
        // Giữ thông báo cũ để FE hiện đúng, hoặc đổi sang PROMOTION_IDENTIFIER_REQUIRED tuỳ bạn
        throw new ResponseException(null, 400, 'PROMOTION_CODE_REQUIRED');
      }

      // ===== Chuẩn bị list promotion cần áp (có thể từ code hoặc id)
      type Candidate = { promo: Promotion; codeUsed: string | null };
      const candidates: Candidate[] = [];

      // Từ code
      for (const code of codes) {
        const promo = await promoRepo.findOne({
          where: { promotionCode: code, isActive: true, isDeleted: false },
          relations: ['categories', 'items'],
        });
        if (!promo) throw new ResponseException(null, 400, 'PROMOTION_CODE_INVALID');
        candidates.push({ promo, codeUsed: code });
      }

      // Từ id
      for (const id of ids) {
        const promo = await promoRepo.findOne({
          where: { id, isActive: true, isDeleted: false },
          relations: ['categories', 'items'],
        });
        if (!promo) throw new ResponseException(null, 400, 'PROMOTION_ID_INVALID');
        // Nếu chọn theo id mà KM có mã, lưu lại cho lịch sử; nếu không, dùng null
        candidates.push({ promo, codeUsed: promo.promotionCode ?? null });
      }

      // load existing
      const existingIps = inv.invoicePromotions ?? [];
      const applied: Array<{ promotionId: string; code: string | null; base: number; discount: number }> = [];

      const addAppliedIp = (promo: Promotion) => {
        existingIps.push({ promotion: promo } as any);
      };

      for (const { promo, codeUsed } of candidates) {
        // 1) đã áp?
        if (existingIps.some(x => x.promotion && x.promotion.id === promo.id)) {
          throw new ResponseException(null, 400, 'PROMOTION_ALREADY_APPLIED');
        }
        // 3) base theo scope
        const orderItems = inv.order?.items ?? [];
        let base = 0;

        if (promo.applyWith === ApplyWith.ORDER) {
          base = this.toNum(inv.totalAmount);
        } else if (promo.applyWith === ApplyWith.CATEGORY) {
          const catSet = new Set((promo.categories ?? []).map(c => c.id));
          base = orderItems.reduce((s, it) => {
            const catId = it.menuItem?.category?.id ?? '';
            const price = this.toNum(it.price);
            const line = price * (it.quantity ?? 0);
            return catSet.has(catId) && Number.isFinite(line) ? s + line : s;
          }, 0);
        } else if (promo.applyWith === ApplyWith.ITEM) {
          const itemSet = new Set((promo.items ?? []).map(i => i.id));
          base = orderItems.reduce((s, it) => {
            const ok = itemSet.has(it.menuItem?.id);
            const price = this.toNum(it.price);
            const line = price * (it.quantity ?? 0);
            return ok && Number.isFinite(line) ? s + line : s;
          }, 0);
        }
        if (base <= 0) throw new ResponseException(null, 400, 'PROMOTION_NOT_APPLICABLE');

        // 4) thời gian & min amount
        const now = new Date();
        if (promo.startAt && now < promo.startAt) throw new ResponseException(null, 400, 'PROMOTION_NOT_STARTED');
        if (promo.endAt && now > promo.endAt) throw new ResponseException(null, 400, 'PROMOTION_EXPIRED');
        const min = Number((promo as any).minOrderAmount ?? 0);
        if (min > 0 && base < min) throw new ResponseException(null, 400, 'PROMOTION_MIN_ORDER_NOT_REACHED');
        if (!this.isInTimeWindow(now, promo)) {
          throw new ResponseException(null, 400, 'PROMOTION_OUT_OF_SCHEDULE');
        }
        // 5) tính giảm
        const discount = this.calcDiscount(base, promo);
        if (discount <= 0) throw new ResponseException(null, 400, 'PROMOTION_DISCOUNT_ZERO');

        // 6) upsert invoice_promotion
        let ip = await ipRepo.findOne({ where: { invoice: { id: inv.id }, promotion: { id: promo.id } } });
        if (!ip) {
          ip = ipRepo.create({
            invoice: { id: inv.id } as any,
            promotion: { id: promo.id } as any,
            applyWith: promo.applyWith,
            codeUsed: codeUsed ?? null,
            calculationBase: base,
            discountAmount: discount,
            audienceMatched: promo.audienceRules ?? null,
          });
        } else {
          ip.applyWith = promo.applyWith;
          ip.codeUsed = codeUsed ?? null;
          ip.calculationBase = base;
          ip.discountAmount = discount;
          ip.audienceMatched = promo.audienceRules ?? null;
        }
        await ipRepo.save(ip);

        applied.push({ promotionId: promo.id, code: codeUsed ?? null, base, discount });
        addAppliedIp(promo);
      }

      // 7) recalc totals & return
      await this.recomputeInvoiceTotals(em, inv.id);
      const full = await invRepo.findOne({
        where: { id: inv.id },
        relations: ['invoicePromotions', 'invoicePromotions.promotion'],
      });

      return new ResponseCommon(200, true, 'PROMOTIONS_APPLIED_SUCCESSFULLY', {
        invoice: full,
        applied,
      });
    });
  }


  async removePromotion(invoiceId: string, invoicePromotionId: string) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const ipRepo = em.getRepository(InvoicePromotion);

      const inv = await invRepo.findOne({ where: { id: invoiceId } });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');
      if (inv.status !== InvoiceStatus.UNPAID) {
        throw new BadRequestException('CANNOT_REMOVE_PROMOTION_FROM_PAID_INVOICE');
      }

      await ipRepo.delete({ id: invoicePromotionId, invoice: { id: invoiceId } as any });

      await this.recomputeInvoiceTotals(em, invoiceId);
      const full = await invRepo.findOne({
        where: { id: invoiceId },
        relations: ['invoicePromotions', 'invoicePromotions.promotion'],
      });

      return { invoice: full };
    });
  }


  async listApplicablePromotions(invoiceId: string) {
    return this.ds.transaction(async (em) => {
      const invRepo = em.getRepository(Invoice);
      const promoRepo = em.getRepository(Promotion);
      const ipRepo = em.getRepository(InvoicePromotion);

      const inv = await invRepo.findOne({
        where: { id: invoiceId },
        relations: ['order', 'order.items', 'order.items.menuItem', 'order.items.menuItem.category'],
      });
      if (!inv) throw new NotFoundException('INVOICE_NOT_FOUND');
      if (inv.status !== InvoiceStatus.UNPAID) {
        throw new BadRequestException('CANNOT_LIST_PROMOTION_FOR_PAID_INVOICE');
      }

      const already = await ipRepo.find({ where: { invoice: { id: inv.id } }, relations: ['promotion'] });
      const appliedIds = new Set(already.map(x => x.promotion.id));

      // ✅ CHỈ LẤY PROMO ÁP DỤNG VỚI HÓA ĐƠN (ORDER)
      const promos = await promoRepo.find({
        where: [
          { isActive: true, isDeleted: false, applyWith: ApplyWith.ORDER },
          { isActive: true, isDeleted: IsNull(), applyWith: ApplyWith.ORDER },
        ],
        order: { createdAt: 'DESC' as any },
      });

      const now = new Date();
      // const orderItems = inv.order?.items ?? [];
      // const orderTotal = orderItems.reduce((s, it) => s + Number(it.price) * it.quantity, 0);
      const orderItems = inv.order?.items ?? [];
      const orderTotal = orderItems.reduce(
        (s, it) => s + Number(it.price) * Number(it.quantity ?? 0),
        0
      );
      const rs = promos.map(p => {
        const base = orderTotal; // vì chỉ ORDER
        let applicable = true;
        let reason: string | null = null;

        // ✅ MỚI: lọc theo lịch (thứ/giờ)
        if (!this.isInTimeWindow(now, p)) { applicable = false; reason = 'OUT_OF_SCHEDULE'; }

        if (applicable && p.startAt && now < p.startAt) { applicable = false; reason = 'NOT_STARTED'; }
        if (applicable && p.endAt && now > p.endAt) { applicable = false; reason = 'EXPIRED'; }

        const min = Number((p as any).minOrderAmount ?? 0);
        if (applicable && min > 0 && base < min) { applicable = false; reason = 'MIN_NOT_REACHED'; }

        const est = applicable ? this.calcDiscount(base, p) : 0;

        return {
          promotionId: p.id,
          promotionCode: p.promotionCode,
          name: p.name,
          description: p.description,
          applyWith: p.applyWith,
          discountType: p.discountTypePromotion,
          discountValue: Number(p.discountValue ?? 0),
          maxDiscountAmount: Number(p.maxDiscountAmount ?? 0),
          base, estimatedDiscount: est,
          applicable, reason,
        };
      });

      return rs.filter(x => x.applicable && x.estimatedDiscount > 0 && !appliedIds.has(x.promotionId));
    });
  }

  /* ==== các method createFromOrder, addPayment, markPaid của bạn giữ nguyên ==== */

  /** Mã HĐ: INV-yyyymmddhhMMss-XXXX (đã có) */
  private async genNumber() {
    const part = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return `INV-${part}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private calcDiscount(base: number, promo: Promotion): number {
    const type = promo.discountTypePromotion;
    const value = this.toNum(promo.discountValue);
    const cap = this.toNum(promo.maxDiscountAmount);

    let discount = 0;

    if (type === DiscountTypePromotion.PERCENT) {
      discount = Math.floor((base * value) / 100);
      if (cap > 0) discount = Math.min(discount, cap);
    } else if (type === DiscountTypePromotion.AMOUNT) {
      discount = Math.round(value);
    }

    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    return Math.min(discount, base);
  }

  private async recomputeInvoiceTotals(em: EntityManager, invoiceId: string) {
    const invRepo = em.getRepository(Invoice);

    const inv = await invRepo.findOneOrFail({
      where: { id: invoiceId },
      relations: [
        'invoicePromotions',
        'invoicePromotions.promotion',
        'order',
        'order.items',
        'order.items.menuItem',
      ],
    });

    const ips = inv.invoicePromotions ?? [];
    const orderItems = inv.order?.items ?? [];

    // 1) Subtotal thực thu theo giá đang lock trên OrderItem
    const total = orderItems.reduce(
      (s, it) => s + Number(it.price ?? 0) * Number(it.quantity ?? 0),
      0
    );

    // 2) Giảm từ KM HÓA ĐƠN và KM MÓN/CATEGORY đã lưu ở invoice_promotions
    const orderPromos = ips.filter(it => it.applyWith === ApplyWith.ORDER);
    const otherPromos = ips.filter(it => it.applyWith !== ApplyWith.ORDER);
    const orderDiscount = orderPromos.reduce((s, it) => s + this.toNum(it.discountAmount), 0);
    const itemCatDiscount = otherPromos.reduce((s, it) => s + this.toNum(it.discountAmount), 0);

    // 3) Giảm “ẩn” theo món nếu đơn giá món đã thấp hơn niêm yết (ví dụ 30k -> 24k)
    //    Điều này cover case KM món hiển thị ở FE nhưng chưa có bản ghi invoice_promotions
    const builtInItemDiscount = orderItems.reduce((s, it) => {
      const listed = Number(it.menuItem?.price ?? 0);   // giá niêm yết
      const locked = Number(it.price ?? 0);            // giá đang tính tiền
      const qty = Number(it.quantity ?? 0);
      const delta = Math.max(0, listed - locked);
      return s + delta * qty;
    }, 0);

    // 4) Tổng giảm & số phải trả
    const discountTotal = Math.min(total, orderDiscount + itemCatDiscount + builtInItemDiscount);
    const finalAmount = Math.max(0, total - discountTotal);

    inv.totalAmount = total.toString() as any;
    inv.discountTotal = discountTotal.toString() as any;
    inv.finalAmount = finalAmount.toString() as any;
    console.log('Recomputed invoice totals:', {
      total,
      orderDiscount,
      itemCatDiscount,
      builtInItemDiscount,
      discountTotal,
      finalAmount,
    });
    await invRepo.save(inv);
    return inv;
  }



  private toNum(v: any): number {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') return Number(v.replace(/[^\d.-]/g, '')) || 0;
    return Number(v) || 0;
  }

  // invoices.service.ts (trích)
  // private isInTimeWindow(now: Date, promo: Promotion) {
  //   if (promo.startAt && now < promo.startAt) return false;
  //   if (promo.endAt && now > promo.endAt) return false;

  //   const rules = promo.audienceRules as any;

  //   if (rules?.daysOfWeek?.length) {
  //     // UI: 1..7 (CN=1)  -> JS: 0..6 (CN=0)
  //     const norm = rules.daysOfWeek.map((d: number) => {
  //       if (d >= 1 && d <= 7) return d - 1; // 1->0, 2->1, ..., 7->6
  //       // fallback nếu đã là 0..6
  //       if (d >= 0 && d <= 6) return d;
  //       return (d % 7 + 7) % 7;
  //     });
  //     const dow = now.getDay(); // 0..6
  //     if (!norm.includes(dow)) return false;
  //   }

  //   if (rules?.startTime && rules?.endTime) {
  //     const [sh, sm] = rules.startTime.split(':').map(Number);
  //     const [eh, em] = rules.endTime.split(':').map(Number);
  //     const m = now.getHours() * 60 + now.getMinutes();
  //     const start = sh * 60 + sm;
  //     const end = eh * 60 + em;
  //     if (m < start || m > end) return false;
  //   }
  //   return true;
  // }
  // invoices.service.ts
  private isInTimeWindow(now: Date, promo: Promotion): boolean {
    // Khoảng ngày
    if (promo.startAt && now < promo.startAt) return false;
    if (promo.endAt && now > promo.endAt) return false;

    const rules: any = (promo as any).audienceRules || {};

    // ==== Chuẩn hoá daysOfWeek (hỗ trợ cả 0..6 và 1..7) ====
    if (Array.isArray(rules.daysOfWeek) && rules.daysOfWeek.length) {
      const raw: number[] = rules.daysOfWeek
        .map((d: any) => Number(d))
        .filter((n) => Number.isFinite(n));

      const looksZeroBased =
        raw.some((n) => n === 0 || n === 6) || raw.every((n) => n >= 0 && n <= 6);

      const norm = looksZeroBased
        ? raw
        : raw.map((n) => ((n - 1) % 7 + 7) % 7); // 1..7 -> 0..6 (an toàn)

      const dow = now.getDay(); // 0..6, CN=0
      if (!norm.includes(dow)) return false;
    }

    // ==== Khung giờ ====
    if (rules?.startTime && rules?.endTime) {
      const [sh, sm] = String(rules.startTime).split(':').map((x) => Number(x) || 0);
      const [eh, em] = String(rules.endTime).split(':').map((x) => Number(x) || 0);
      const cur = now.getHours() * 60 + now.getMinutes();
      const from = sh * 60 + sm;
      const to = eh * 60 + em;
      if (cur < from || cur > to) return false; // (from..to) dạng inclusive
    }

    return true;
  }


  private computeBase(inv: Invoice, promo: Promotion): number {
    const items = inv.order?.items ?? [];

    if (promo.applyWith === ApplyWith.ORDER) {
      return this.toNum(inv.totalAmount);
    }

    if (promo.applyWith === ApplyWith.CATEGORY) {
      const set = new Set((promo.categories ?? []).map(c => c.id));
      return items.reduce((s, it) => {
        const ok = set.has(it.menuItem?.category?.id ?? '');
        const price = Number(it.price ?? 0);
        const qty = Number(it.quantity ?? 0);
        return s + (ok ? price * qty : 0);
      }, 0);
    }

    if (promo.applyWith === ApplyWith.ITEM) {
      const set = new Set((promo.items ?? []).map(i => i.id));
      return items.reduce((s, it) => {
        const ok = set.has(it.menuItem?.id);
        const price = Number(it.price ?? 0);
        const qty = Number(it.quantity ?? 0);
        return s + (ok ? price * qty : 0);
      }, 0);
    }

    return 0;
  }



  private computeDiscount(base: number, promo: Promotion): number {
    const type = promo.discountTypePromotion;
    const val = Number(promo.discountValue ?? 0);
    let d = 0;
    if (type === 'PERCENT') d = Math.floor((base * val) / 100);
    else if (type === 'AMOUNT') d = val;
    const max = Number((promo as any).maxDiscountAmount ?? 0);
    if (max > 0) d = Math.min(d, max);
    return Math.max(0, d);
  }

  private async autoApplyPromotions(em: EntityManager, invoiceId: string) {
    const invRepo = em.getRepository(Invoice);
    const ipRepo = em.getRepository(InvoicePromotion);
    const promoRepo = em.getRepository(Promotion);

    const inv = await invRepo.findOne({
      where: { id: invoiceId },
      relations: [
        'order', 'order.items', 'order.items.menuItem', 'order.items.menuItem.category',
        'invoicePromotions', 'invoicePromotions.promotion'
      ],
    });
    if (!inv) throw new ResponseException(null, 404, 'INVOICE_NOT_FOUND');
    if (inv.status !== InvoiceStatus.UNPAID) return;

    const now = new Date();

    // ========== 1) CLEANUP các IP đã KHÔNG còn hợp lệ ==========
    const existingIps = await ipRepo.find({
      where: { invoice: { id: inv.id } },
      relations: ['promotion'],
    });

    for (const ip of existingIps) {
      const p = ip.promotion;
      if (!p) { await ipRepo.delete({ id: ip.id }); continue; }

      // Lệch lịch/ngày -> xoá
      if (!this.isInTimeWindow(now, p)) {
        await ipRepo.delete({ id: ip.id });
        continue;
      }

      // Base hiện tại không còn match scope hoặc không đủ min -> xoá
      const baseNow = this.computeBase(inv, p);
      const minNow = Number((p as any).minOrderAmount ?? 0);
      if (baseNow <= 0 || (minNow > 0 && baseNow < minNow)) {
        await ipRepo.delete({ id: ip.id });
        continue;
      }
    }

    // Sau cleanup, reload nhẹ danh sách IP để biết còn ORDER hay chưa
    const ipsAfter = await ipRepo.find({
      where: { invoice: { id: inv.id } },
      relations: ['promotion'],
    });
    const hasOrderIp = ipsAfter.some(ip => ip.promotion?.applyWith === ApplyWith.ORDER);

    // ========== 2) TỰ ÁP các promo đang hoạt động ==========
    const promos = await promoRepo.find({
      where: { isActive: true, isDeleted: false },
      relations: ['categories', 'items'],
    });

    for (const promo of promos) {
      // ORDER chỉ auto khi (không có code || autoApply=true) VÀ hiện chưa có ORDER IP
      const isAutoOrder = (!promo.promotionCode || (promo as any).autoApply === true) && !hasOrderIp;
      const isAuto = promo.applyWith === ApplyWith.ORDER ? isAutoOrder : true;
      if (!isAuto) continue;

      if (!this.isInTimeWindow(now, promo)) continue;

      const base = this.computeBase(inv, promo);
      if (base <= 0) continue;

      const min = Number((promo as any).minOrderAmount ?? 0);
      if (min > 0 && base < min) continue;

      const discountForStats = this.computeDiscount(base, promo);
      if (discountForStats <= 0) continue;

      // upsert theo (invoice, promotion)
      let ip = await ipRepo.findOne({
        where: { invoice: { id: inv.id }, promotion: { id: promo.id } },
      });

      if (!ip) {
        ip = ipRepo.create({
          invoice: { id: inv.id } as any,
          promotion: { id: promo.id } as any,
          applyWith: promo.applyWith,
          codeUsed: promo.promotionCode ?? null,
          calculationBase: base,
          discountAmount: discountForStats,
          audienceMatched: promo.audienceRules ?? null,
        });
      } else {
        ip.applyWith = promo.applyWith;
        ip.codeUsed = promo.promotionCode ?? null;
        ip.calculationBase = base;
        ip.discountAmount = discountForStats;
        ip.audienceMatched = promo.audienceRules ?? null;
      }

      await ipRepo.save(ip);
      // Nếu vừa auto áp một ORDER promo, chặn các ORDER khác trong cùng lượt
      if (promo.applyWith === ApplyWith.ORDER) {
        // Đảm bảo chỉ một ORDER IP
        // (không xoá cái cũ tại đây vì đã cleanup trước đó)
        break;
      }
    }
  }




}
