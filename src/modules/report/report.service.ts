// report.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { OrderStatus, InvoiceStatus } from 'src/common/enums';
import type { RangeKey } from 'src/common/date-range';
import { resolveRange } from 'src/common/date-range';
import { OrderItem } from 'src/modules/orderitems/entities/orderitem.entity';
import { SalesDailyQueryDto } from './dto/sales-daily.query.dto';
import { SupplierReportQueryDto } from './dto/supplier-report.query.dto';
import { User } from '@modules/user/entities/user.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { StaffReportQueryDto } from './dto/staff-report.query.dto';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { BaseRangeDto } from './dto/base-range.dto';
import { CashbookDailyQueryDto } from './dto/cashbook-daily.query.dto';
@Injectable()
export class ReportService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly oiRepo: Repository<OrderItem>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(MenuItem) private readonly miRepo: Repository<MenuItem>,
  ) { }

  // === cấu hình múi giờ dùng chung ===
  private readonly TZ = process.env.TZ_DB ?? 'Asia/Ho_Chi_Minh';
  // Vì Asia/Ho_Chi_Minh cố định GMT+7 (không DST), dùng trực tiếp để suy ra mốc UTC cho 00:00 local
  private readonly TZ_OFFSET = '+07:00';

  // format YYYY-MM-DD theo TZ VN (KHÔNG dùng toISOString)
  private fmtYMD(d: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d); // ví dụ 2025-09-18
  }


async summary(range: RangeKey) {
  const { start, end } = resolveRange(range);
  const TZ = this.TZ; 

  // 1) Doanh thu = SUM(final_amount) invoice PAID trong khoảng
  const revRow = await this.invRepo
    .createQueryBuilder('inv')
    .select('COALESCE(SUM(CAST(inv.final_amount AS numeric)), 0)', 'revenue')
    .where('inv.status = :st', { st: InvoiceStatus.PAID })
    .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
      tz: TZ,
      start,
      end,
    })
    .getRawOne<{ revenue: string }>();
  const revenue = Number(revRow?.revenue ?? 0);

  // 2) ĐƠN ĐÃ XONG = số invoice PAID trong khoảng
  const doneRow = await this.invRepo
    .createQueryBuilder('inv')
    .select('COUNT(1)', 'c')
    .where('inv.status = :st', { st: InvoiceStatus.PAID })
    .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
      tz: TZ,
      start,
      end,
    })
    .getRawOne<{ c: string }>();
  const ordersDone = Number(doneRow?.c ?? 0);

  // 3) ĐANG PHỤC VỤ = số BÀN đang có order mở hiện tại
  const inServiceRow = await this.orderRepo
    .createQueryBuilder('o')
    .select('COUNT(DISTINCT "o"."tableId")', 'c')
    .where('o.status IN (:...sts)', {
      sts: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    })
    .andWhere('"o"."tableId" IS NOT NULL')
    .andWhere('"o"."merged_into_id" IS NULL')
    .getRawOne<{ c: string }>();
  const inService = Number(inServiceRow?.c ?? 0);

  // ❌ Không tính customers nữa
  return { revenue, ordersDone, inService };
}


  /** Chuỗi doanh số theo ngày/giờ/thứ (TZ VN) */
  async salesSeries(range: RangeKey, granularity: 'day' | 'hour' | 'dow') {
    const { start, end } = resolveRange(range);

    if (granularity === 'day') {
      // group theo ngày local
      const rows = await this.invRepo
        .createQueryBuilder('inv')
        .select(
          `to_char(date_trunc('day', inv.updated_at AT TIME ZONE :tz), 'YYYY-MM-DD')`,
          'label',
        )
        .addSelect(`SUM(CAST(inv.total_amount AS numeric))`, 'value')
        .where('inv.status = :st', { st: InvoiceStatus.PAID })
        .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
          tz: this.TZ,
          start,
          end,
        })
        .groupBy('label')
        .orderBy('label', 'ASC')
        .getRawMany<{ label: string; value: string }>();

      // lấp ngày trống theo TZ VN
      const bucket: Record<string, number> = {};
      for (
        let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        d <= end;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      ) {
        bucket[this.fmtYMD(d)] = 0; // ✅ KHÔNG dùng toISOString()
      }
      for (const r of rows) bucket[r.label] = Number(r.value || 0);

      return Object.entries(bucket).map(([label, value]) => ({ label, value }));
    }

    if (granularity === 'hour') {
      const rows = await this.invRepo
        .createQueryBuilder('inv')
        .select(`extract(hour from inv.updated_at AT TIME ZONE :tz)`, 'h')
        .addSelect(`SUM(CAST(inv.total_amount AS numeric))`, 'value')
        .where('inv.status = :st', { st: InvoiceStatus.PAID })
        .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
          tz: this.TZ,
          start,
          end,
        })
        .groupBy('h')
        .orderBy('h', 'ASC')
        .getRawMany<{ h: string; value: string }>();

      const arr = Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: 0 }));
      for (const r of rows) {
        const i = Number(r.h);
        if (Number.isFinite(i)) arr[i].value = Number(r.value || 0);
      }
      return arr;
    }

    // day-of-week: 0=CN..6=T7 theo TZ VN
    const rows = await this.invRepo
      .createQueryBuilder('inv')
      .select(`extract(dow from inv.updated_at AT TIME ZONE :tz)`, 'd')
      .addSelect(`SUM(CAST(inv.total_amount AS numeric))`, 'value')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
        tz: this.TZ,
        start,
        end,
      })
      .groupBy('d')
      .orderBy('d', 'ASC')
      .getRawMany<{ d: string; value: string }>();

    const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const arr = labels.map((l, i) => ({ label: l, value: 0 }));
    for (const r of rows) {
      const i = Number(r.d);
      if (Number.isFinite(i)) arr[i].value = Number(r.value || 0);
    }
    return arr;
  }
  async topItems(range: RangeKey, by: 'qty' | 'revenue', limit = 10) {
    const { start, end } = resolveRange(range);

    // Query từ bảng order_items, join order -> invoice (PAID) -> menuItem
    const qb = this.oiRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('o.invoice', 'inv')      // OneToOne(Order -> Invoice)
      .innerJoin('oi.menuItem', 'mi')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, {
        tz: this.TZ,
        start,
        end,
      });

    if (by === 'qty') {
      qb.select('mi.name', 'name')
        .addSelect('SUM(oi.quantity)', 'value');
    } else {
      qb.select('mi.name', 'name')
        .addSelect(
          `SUM(oi.quantity * CAST(oi.price AS numeric))`,
          'value'
        );
    }

    const rows = await qb
      .groupBy('mi.id')
      .addGroupBy('mi.name')
      .orderBy('value', 'DESC')
      .limit(Number(limit) || 10)
      .getRawMany<{ name: string; value: string }>();

    return rows.map(r => ({ name: r.name, value: Number(r.value || 0) }));
  }

  /* ====== Dùng cho page BÁO CÁO ====== */

  /* ====== 1. BÁO CÁO CUỐI NGÀY ====== */
  // ====== BÁN HÀNG (EOD: chỉ hóa đơn) ======
  async salesDaily(q: SalesDailyQueryDto) {
    try {
      const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
      const page = Math.max(1, Number((q as any).page) || 1);
      const limit = Math.min(10, Math.max(1, Number((q as any).limit) || 10));

      // ===== COUNT (đã OK) =====
      const countQb = this.invRepo.createQueryBuilder('inv')
        .innerJoin('inv.order', 'o')
        .innerJoin('o.items', 'oi')
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .leftJoin('o.createdBy', 'ur')
        .leftJoin('ur.profile', 'pf')
        .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
        .select('COUNT(DISTINCT inv.id)', 'total');
      if (q.paymentMethod) countQb.leftJoin('inv.payments', 'pay').andWhere('pay.method = :pm', { pm: q.paymentMethod });
      if (q.areaId) countQb.andWhere('a.id = :aid', { aid: q.areaId });
      this.applyOrderFilters(countQb as any, q);
      const total = Number((await countQb.getRawOne<{ total: string }>())?.total || 0);

      // ===== SUMMARY TOÀN KỲ (KHÔNG PHÂN TRANG) =====
      // Gom theo từng invoice rồi cộng lại trong Node để tránh mọi khả năng nhân bản do join 1-n khác.
      const baseQb = this.invRepo.createQueryBuilder('inv')
        .innerJoin('inv.order', 'o')
        .innerJoin('o.items', 'oi')
        .leftJoin('inv.payments', 'pay') // chỉ dùng khi filter paymentMethod
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .leftJoin('o.createdBy', 'ur')
        .leftJoin('ur.profile', 'pf')
        .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
        .select('inv.id', 'invId')
        .addSelect('SUM(oi.quantity)', 'itemsCount')
        .addSelect('SUM(oi.quantity * oi.price)', 'goodsAmount')
        .addSelect('COALESCE(inv.discountTotal,0)', 'invoiceDiscount')
        .groupBy('inv.id');

      if (q.paymentMethod) baseQb.andWhere('pay.method = :pm', { pm: q.paymentMethod });
      if (q.areaId) baseQb.andWhere('a.id = :aid', { aid: q.areaId });
      this.applyOrderFilters(baseQb as any, q);

      const aggRows = await baseQb.getRawMany<{
        invId: string; itemsCount: string; goodsAmount: string; invoiceDiscount: string;
      }>();

      const totalSum = aggRows.reduce((a, r) => {
        const items = Number(r.itemsCount || 0);
        const goods = Number(r.goodsAmount || 0);
        const disc = Number(r.invoiceDiscount || 0);
        a.itemsCount += items;
        a.goodsAmount += goods;
        a.invoiceDiscount += disc;
        a.revenue += (goods - disc);
        return a;
      }, { itemsCount: 0, goodsAmount: 0, invoiceDiscount: 0, revenue: 0, otherIncome: 0, tax: 0, returnFee: 0 } as any);

      // ===== ROWS PHÂN TRANG (như cũ) =====
      const invQb = this.invRepo.createQueryBuilder('inv')
        .select(`
        'INVOICE' as "docType",
        inv.invoiceNumber as "docCode",
        COALESCE(a.name || ' / ' || t.name, t.name, a.name) as "place",
        pf.fullName as "receiverName",
        to_char(inv.created_at,'HH24:MI') as "time",
        inv.created_at as "occurredAt",
        STRING_AGG(DISTINCT pay.method, ',') as "payMethod",
        SUM(oi.quantity) as "itemsCount",
        SUM(oi.quantity * oi.price) as "goodsAmount",
        COALESCE(inv.discountTotal,0) as "invoiceDiscount",
        (SUM(oi.quantity * oi.price) - COALESCE(inv.discountTotal,0)) as "revenue",
        0 as "otherIncome",
        0 as "tax",
        0 as "returnFee"
      `)
        .innerJoin('inv.order', 'o')
        .innerJoin('o.items', 'oi')
        .leftJoin('inv.payments', 'pay')
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .leftJoin('o.createdBy', 'ur')
        .leftJoin('ur.profile', 'pf')
        .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
        .groupBy('inv.id, t.name, a.name, pf.fullName, to_char(inv.created_at,\'HH24:MI\')')
        .orderBy('inv.createdAt', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit);
      if (q.paymentMethod) invQb.andWhere('pay.method = :pm', { pm: q.paymentMethod });
      if (q.areaId) invQb.andWhere('a.id = :aid', { aid: q.areaId });
      this.applyOrderFilters(invQb, q);

      const invoices = await invQb.getRawMany();

      // Tổng của TRANG hiện tại (nếu bạn muốn hiển thị dưới group)
      const pageSum = invoices.reduce((a: any, r: any) => ({
        goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
        invoiceDiscount: a.invoiceDiscount + Number(r.invoiceDiscount || 0),
        revenue: a.revenue + Number(r.revenue || 0),
        otherIncome: a.otherIncome + Number(r.otherIncome || 0),
        tax: a.tax + Number(r.tax || 0),
        returnFee: a.returnFee + Number(r.returnFee || 0),
        // nếu cần itemsCount theo trang:
        itemsCount: (a.itemsCount || 0) + Number(r.itemsCount || 0),
      }), { goodsAmount: 0, invoiceDiscount: 0, revenue: 0, otherIncome: 0, tax: 0, returnFee: 0, itemsCount: 0 });

      const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };
      const data = {
        printedAt: new Date().toISOString(),
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          itemsCount: totalSum.itemsCount,
          goodsAmount: totalSum.goodsAmount,
          invoiceDiscount: totalSum.invoiceDiscount,
          revenue: totalSum.revenue,
          otherIncome: totalSum.otherIncome,
          tax: totalSum.tax,
          returnFee: totalSum.returnFee,
          invoiceCount: total,
        },
        groups: [
          {
            title: `Hóa đơn: ${invoices.length}`,
            totalCount: invoices.length,
            pageSum,
            rows: invoices,
          },
        ],
      };

      return new ResponseCommon<typeof data, PageMeta>(200, true, 'OK', data, meta);
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_DAILY_SALES_FAILED');
    }
  }


  // ====== THU CHI (cashbook) ======
  async cashbookDaily(q: CashbookDailyQueryDto) {
    try {
      const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
      const page = Math.max(1, Number((q as any).page) || 1);
      // Giới hạn tối đa 10 dòng/ trang cho báo cáo này
      const limit = Math.min(10, Math.max(1, Number((q as any).limit) || 10));

      // Total
      const countQb = this.ds.createQueryBuilder()
        .from('cashbook_entries', 'cb')
        .leftJoin('invoices', 'inv', 'inv.id = cb.invoice_id')
        .leftJoin('purchase_receipts', 'prc', 'prc.id = cb.purchase_receipt_id')
        .leftJoin('orders', 'o', 'o.id = inv.order_id')
        .leftJoin('tables', 't', 't.id = o."tableId"')
        .leftJoin('areas', 'ar', 'ar.id = t.area_id')
        .leftJoin('customers', 'cus', 'cus.id = cb.customer_id')
        // Dùng created_at cho range để khớp đúng kỳ bạn đang xem trên UI
        .where('cb.created_at >= :from AND cb.created_at < :to', { from, to })
        // Bỏ các phiếu thu/chi mồ côi trỏ tới invoice đã xóa (do hủy đơn)
        .andWhere('(cb.invoice_id IS NULL OR inv.id IS NOT NULL)')
        // Đếm theo DISTINCT cb.id để tránh nhân bản do các join 1-n                                                                                                                                      
        .select('COUNT(DISTINCT cb.id)', 'total');
      const countRow = await countQb.getRawOne<{ total: string }>();
      const total = Number(countRow?.total || 0);

      const qb = this.ds.createQueryBuilder()
        .from('cashbook_entries', 'cb')
        .leftJoin('cash_types', 'ct', 'ct.id = cb.cash_type_id')
        .leftJoin('customers', 'cus', 'cus.id = cb.customer_id')
        .leftJoin('suppliers', 'sup', 'sup.id = cb.supplier_id')
        .leftJoin('cash_other_parties', 'cop', 'cop.id = cb.cash_other_party_id')
        .leftJoin('invoices', 'inv', 'inv.id = cb.invoice_id')
        .leftJoin('orders', 'o', 'o.id = inv.order_id')
        .leftJoin('tables', 't', 't.id = o."tableId"')
        .leftJoin('areas', 'ar', 'ar.id = t.area_id')
        .leftJoin('purchase_receipts', 'prc', 'prc.id = cb.purchase_receipt_id')
        .leftJoin('users', 'ucr', 'ucr.id = inv.cashier_id')
        .leftJoin('profiles', 'pcr', 'pcr.user_id = ucr.id')
        .leftJoin('users', 'ur', 'ur.id = o."createdById"')
        .leftJoin('profiles', 'pr', 'pr.user_id = ur.id')
        .leftJoin('users', 'ucrp', 'ucrp.id = prc.created_by_id')
        .leftJoin('profiles', 'pcrp', 'pcrp.user_id = ucrp.id')
        // .distinct(true)
        .select(`cb.code`, 'code')
        .addSelect(`to_char(cb.created_at AT TIME ZONE :tz,'HH24:MI')`, 'time')
        .addSelect('cb.created_at', 'occurredAt')
        .addSelect(`CASE WHEN cb.type = 'RECEIPT' THEN cb.amount::numeric ELSE 0 END`, 'receipt')
        .addSelect(`CASE WHEN cb.type = 'PAYMENT' THEN cb.amount::numeric ELSE 0 END`, 'payment')
        .addSelect(`ct.name`, 'cashType')
        .addSelect(`COALESCE(cus.name, sup.name, cop.name)`, 'counterparty')
        .addSelect('t.name', 'tableName')
        .addSelect('ar.name', 'areaName')
        .addSelect('COALESCE(ucr.id::text, ucrp.id::text)', 'creatorId')
        .addSelect('COALESCE(pcr.full_name, pcrp.full_name)', 'creatorName')
        .addSelect('ur.id', 'receiverId')
        .addSelect('pr.full_name', 'receiverName')
        .addSelect(`(
          SELECT STRING_AGG(DISTINCT p.method, ',')
          FROM payments p
          WHERE p."invoiceId" = inv.id
        )`, 'paymentMethods')
        .where('cb.created_at >= :from AND cb.created_at < :to', { from, to })
        .andWhere('(cb.invoice_id IS NULL OR inv.id IS NOT NULL)')
        // .orderBy('cb.date', 'ASC')
        .orderBy('cb.created_at', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit)
        .setParameters({ tz: this.TZ });

      const rows = await qb.getRawMany<{
        code: string; time: string; occurredAt: string; receipt: string; payment: string; cashType: string; counterparty: string; tableName: string; areaName: string; paymentMethods: string; creatorId: string | null; creatorName: string | null; receiverId: string | null; receiverName: string | null;
      }>();
      // ===== Tổng toàn kỳ (không phân trang) =====
      const sumRow = await this.ds.createQueryBuilder()
        .from('cashbook_entries', 'cb')
        .select(`SUM(CASE WHEN cb.type = 'RECEIPT' THEN cb.amount::numeric ELSE 0 END)`, 'totalReceipt')
        .addSelect(`SUM(CASE WHEN cb.type = 'PAYMENT' THEN cb.amount::numeric ELSE 0 END)`, 'totalPayment')
        .where('cb.created_at >= :from AND cb.created_at < :to', { from, to })
        .getRawOne<{ totalReceipt: string; totalPayment: string }>();

      const totalSum = {
        receipt: Number(sumRow?.totalReceipt || 0),   // Tổng thu
        payment: Number(sumRow?.totalPayment || 0),   // Tổng chi
      };

      const sum = rows.reduce((a, r) => ({
        receipt: a.receipt + Number(r.receipt || 0),
        payment: a.payment + Number(r.payment || 0),
      }), { receipt: 0, payment: 0 });
      const pageSum = rows.reduce((a, r) => ({
        receipt: a.receipt + Number(r.receipt || 0),
        payment: a.payment + Number(r.payment || 0),
      }), { receipt: 0, payment: 0 });

      const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };

      const data = {
        printedAt: new Date().toISOString(),
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          totalReceipt: totalSum.receipt,                 // Tổng thu
          totalPayment: totalSum.payment,                 // Tổng chi
          diff: totalSum.receipt - totalSum.payment,      // Chênh lệch
          voucherCount: total,                            // Số phiếu
        },
        groups: [{
          title: `Thu chi: ${rows.length}`, pageSum, totalCount: rows.length, sum, rows: rows.map(r => ({
            code: r.code,
            time: r.time,
            occurredAt: r.occurredAt,
            receipt: r.receipt,
            payment: r.payment,
            cashType: r.cashType,
            counterparty: r.counterparty,
            tableName: r.tableName,
            areaName: r.areaName,
            creatorId: r.creatorId,
            creatorName: r.creatorName,
            receiverId: r.receiverId,
            receiverName: r.receiverName,
            paymentMethods: r.paymentMethods,
          }))
        }],
      };
      return new ResponseCommon<typeof data, PageMeta>(200, true, 'OK', data, meta);
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_DAILY_CASHBOOK_FAILED');
    }
  }

  // ====== HỦY MÓN ======
  async cancelItemsDaily(q: BaseRangeDto) {
    try {
      const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
      const page = Math.max(1, Number((q as any).page) || 1);
      // Giới hạn tối đa 10 dòng/ trang cho báo cáo này
      const limit = Math.min(10, Math.max(1, Number((q as any).limit) || 10));

      // Đếm tổng số DÒNG hủy (mỗi order_item bị hủy) thay vì distinct item
      const countQb = this.oiRepo.createQueryBuilder('oi')
        .innerJoin('oi.order', 'o')
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .innerJoin('oi.menuItem', 'mi')
        .leftJoin('mi.category', 'c')
        .where('oi.cancelledAt IS NOT NULL')
        .andWhere('oi.cancelledAt >= :from AND oi.cancelledAt < :to', { from, to })
        .select('COUNT(oi.id)', 'total');
      if (q.tableId) countQb.andWhere('t.id = :tid', { tid: q.tableId });
      if (q.areaId) countQb.andWhere('a.id = :aid', { aid: q.areaId });
      const countRow = await countQb.getRawOne<{ total: string }>();
      const total = Number(countRow?.total || 0);

      // Lấy chi tiết từng món hủy
      const qb = this.oiRepo.createQueryBuilder('oi')
        .innerJoin('oi.order', 'o')
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .innerJoin('oi.menuItem', 'mi')
        .leftJoin('mi.category', 'c')
        .leftJoin('users', 'u', 'u.id::text = oi.cancelled_by')
        .leftJoin('profiles', 'pr', 'pr.user_id = u.id')
        .select('oi.id', 'rowId')
        .addSelect('mi.id', 'itemCode')
        .addSelect('mi.name', 'itemName')
        .addSelect('c.name', 'categoryName')
        .addSelect('t.name', 'tableName')
        .addSelect('a.name', 'areaName')
        .addSelect('oi.quantity', 'cancelQty')
        .addSelect('(oi.quantity * oi.price)', 'cancelValue')
        .addSelect('oi.cancel_reason', 'cancelReason')
        .addSelect('oi.cancelled_by', 'cancelledBy')
        .addSelect('pr.full_name', 'cancelledByName')
        .addSelect(`to_char(oi.cancelled_at AT TIME ZONE '${this.TZ}','HH24:MI')`, 'time')
        .addSelect('oi.cancelled_at', 'occurredAt')
        .where('oi.cancelledAt IS NOT NULL')
        .andWhere('oi.cancelledAt >= :from AND oi.cancelledAt < :to', { from, to })
        .orderBy('oi.cancelledAt', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit);

      if (q.tableId) qb.andWhere('t.id = :tid', { tid: q.tableId });
      if (q.areaId) qb.andWhere('a.id = :aid', { aid: q.areaId });

      const rows = await qb.getRawMany<{
        rowId: string; itemCode: string; itemName: string; categoryName: string;
        tableName: string; areaName: string; cancelQty: string; cancelValue: string;
        cancelReason: string; cancelledBy: string; cancelledByName: string; time: string; occurredAt: string;
      }>();

      const sum = rows.reduce((a, r) => ({
        cancelQty: a.cancelQty + Number(r.cancelQty || 0),
        cancelValue: a.cancelValue + Number(r.cancelValue || 0),
      }), { cancelQty: 0, cancelValue: 0 });

      const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };
      const data = {
        printedAt: new Date().toISOString(),
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        groups: [{
          title: `Hủy món: ${rows.length}`,
          totalCount: rows.length,
          sum,
          rows: rows.map(r => ({
            rowId: r.rowId,
            itemCode: r.itemCode,
            itemName: r.itemName,
            categoryName: r.categoryName,
            tableName: r.tableName,
            areaName: r.areaName,
            cancelQty: r.cancelQty,
            cancelValue: r.cancelValue,
            cancelReason: r.cancelReason,
            cancelledBy: r.cancelledBy,
            cancelledByName: r.cancelledByName,
            time: r.time,
            occurredAt: r.occurredAt,
          }))
        }],
      };
      return new ResponseCommon<typeof data, PageMeta>(200, true, 'OK', data, meta);
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_DAILY_CANCEL_ITEMS_FAILED');
    }
  }



  /* ====== 1) BÁN HÀNG THEO NHÂN VIÊN ====== */
  async staffSales(q: StaffReportQueryDto) {
    // Dùng resolveLocalRange để map ngày local VN -> [from, to) UTC, tránh case to=from khi user gửi YYYY-MM-DD
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number((q as any).page) || 1);
    const limit = Math.min(500, Math.max(1, Number((q as any).limit) || 50));
    // Thay đổi: gộp theo (creator nếu có, ngược lại cashier) giống logic staffSalesItems để tránh xuất hiện thêm 1 nhân viên không mong muốn.
    const exprUserId = `COALESCE(cashier.id, creator.id)`;
    const exprFullName = `COALESCE(cpf.full_name, pf.full_name)`;

    const qb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .leftJoin('o.createdBy', 'creator')
      .leftJoin('creator.profile', 'pf')
      .leftJoin('inv.cashier', 'cashier')
      .leftJoin('cashier.profile', 'cpf')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select(exprUserId, 'userId')
      .addSelect(exprFullName, 'fullName')
      .addSelect('SUM(oi.quantity * oi.price)', 'amountGoods')
      .addSelect('SUM(COALESCE(inv.discountTotal,0))', 'discountTotal')
      .groupBy(exprUserId)
      .addGroupBy(exprFullName);

    this.applyOrderFilters(qb as any, q);
    if (q.createdBy) {
      // lọc theo nhân viên tạo (creator); nếu muốn bắt cả cashier có thể mở rộng thêm OR cashier.id
      qb.andWhere('creator.id = :cid', { cid: q.createdBy });
    }

    const rows = await qb.getRawMany<{ userId: string; fullName: string; amountGoods: string; discountTotal: string; }>();

    // --- Lấy chi tiết theo ngày cho từng nhân viên (giống panel chi tiết trong ảnh) ---
    const dailyQb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .leftJoin('o.createdBy', 'creator')
      .leftJoin('inv.cashier', 'cashier')
      .select('COALESCE(cashier.id, creator.id)', 'userId')
      .addSelect(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`, 'd')
      .addSelect('SUM(oi.quantity * oi.price)', 'goods')
      .addSelect('SUM(COALESCE(inv.discountTotal,0))', 'disc')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .groupBy('COALESCE(cashier.id, creator.id)')
      .addGroupBy(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`);
    if (q.createdBy) dailyQb.andWhere('creator.id = :cid', { cid: q.createdBy });
    const dailyRows = await dailyQb.getRawMany<{ userId: string; d: string; goods: string; disc: string }>();

    const dailyMap = new Map<string, Array<{ date: string; revenue: number; netRevenue: number }>>();
    for (const r of dailyRows) {
      const goods = Number(r.goods || 0);
      const disc = Number(r.disc || 0);
      const net = goods - disc;
      const arr = dailyMap.get(r.userId) || [];
      arr.push({ date: r.d, revenue: goods, netRevenue: net });
      dailyMap.set(r.userId, arr);
    }

    const all = rows.map(r => {
      const goods = Number(r.amountGoods || 0);
      const disc = Number(r.discountTotal || 0);
      const net = goods - disc;
      return {
        userId: r.userId,
        fullName: r.fullName || 'Không rõ',
        revenue: net,
        returnValue: 0,
        netRevenue: net,
        days: dailyMap.get(r.userId) || [],
      };
    }).filter(r => r.userId); // loại bỏ record không có user nếu phát sinh

    all.sort((a, b) => b.revenue - a.revenue);
    const total = all.length;
    const paged = all.slice((page - 1) * limit, (page - 1) * limit + limit);
    const header = {
      staffCount: total,
      revenue: all.reduce((a, x) => a + x.revenue, 0),
      returnValue: 0,
      netRevenue: all.reduce((a, x) => a + x.netRevenue, 0),
    };

    const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };
    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      rows: paged,
    }, meta);
  }

  /* ====== 2) BÁO CÁO HÀNG BÁN THEO NHÂN VIÊN ====== */
  async staffSalesItems(q: StaffReportQueryDto) {
    // Đồng bộ cách tính khoảng ngày như các báo cáo khác
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number((q as any).page) || 1);
    const limit = Math.min(10, Math.max(1, Number((q as any).limit) || 10));
    const amt = `oi.quantity * oi.price`;
    // Tổng tiền hàng của HÓA ĐƠN hiện tại
    const invGoodsTotal = `
      (SELECT SUM(oi3.quantity * oi3.price)
         FROM order_items oi3
        WHERE oi3."orderId" = o.id)
    `;

    // Phân bổ mức ORDER
    const discOrder = `
      COALESCE(
        (${amt}) / NULLIF(${invGoodsTotal}, 0) *
        (SELECT COALESCE(SUM(ip."discountAmount"),0)
           FROM invoice_promotions ip
          WHERE ip.invoice_id = inv.id AND ip."applyWith" = 'ORDER'),
        0
      )
    `;

    // Phân bổ mức CATEGORY
    const discCategory = `
      COALESCE((
        SELECT SUM(
          ip."discountAmount" * (${amt}) /
          NULLIF((
            SELECT SUM(oi2.quantity * oi2.price)
              FROM order_items oi2
              JOIN menu_items mi2 ON mi2.id = oi2."menuItemId"
             WHERE oi2."orderId" = o.id
               AND EXISTS (
                 SELECT 1 FROM promotion_categories pc
                  WHERE pc.promotion_id = ip.promotion_id
                    AND pc.category_id   = mi2."categoryId"
               )
          ), 0)
        )
          FROM invoice_promotions ip
         WHERE ip.invoice_id = inv.id
           AND ip."applyWith" = 'CATEGORY'
           AND EXISTS (
             SELECT 1 FROM promotion_categories pc
              WHERE pc.promotion_id = ip.promotion_id
                AND pc.category_id   = mi."categoryId"
           )
      ),0)
    `;

    // Phân bổ mức ITEM
    const discItem = `
      COALESCE((
        SELECT SUM(
          ip."discountAmount" * (${amt}) /
          NULLIF((
            SELECT SUM(oi2.quantity * oi2.price)
              FROM order_items oi2
             WHERE oi2."orderId" = o.id
               AND EXISTS (
                 SELECT 1 FROM promotion_items pi
                  WHERE pi.promotion_id = ip.promotion_id
                    AND pi.item_id       = oi2."menuItemId"
               )
          ), 0)
        )
          FROM invoice_promotions ip
         WHERE ip.invoice_id = inv.id
           AND ip."applyWith" = 'ITEM'
           AND EXISTS (
             SELECT 1 FROM promotion_items pi
              WHERE pi.promotion_id = ip.promotion_id
                AND pi.item_id       = mi.id
           )
      ),0)
    `;

    const allocated = `(${discOrder}) + (${discCategory}) + (${discItem})`;
    const exprUserId = `COALESCE(cash.id, creator.id)`;
    const exprFullName = `COALESCE(cprof.full_name, cp.full_name)`;

    const qb = this.oiRepo.createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('o.invoice', 'inv')
      .leftJoin('o.createdBy', 'creator')
      .leftJoin('creator.profile', 'cp')
      .leftJoin('inv.cashier', 'cash')
      .leftJoin('cash.profile', 'cprof')
      .innerJoin('oi.menuItem', 'mi')
      .leftJoin('mi.category', 'c')
      .where('inv.created_at >= :from AND inv.created_at < :to', { from, to })

      .select(exprUserId, 'userId')
      .addSelect(exprFullName, 'fullName')
      .addSelect('mi.id', 'itemCode')
      .addSelect('mi.name', 'itemName')
      .addSelect(`SUM(oi.quantity)`, 'soldQty')
      .addSelect(`SUM(${amt})`, 'goodsAmount')
      .addSelect(`SUM(${allocated})`, 'allocatedDiscount')
      .addSelect(`SUM(${amt}) - SUM(${allocated})`, 'netRevenue')
      .groupBy(exprUserId)
      .addGroupBy(exprFullName)
      .addGroupBy('mi.id')
      .addGroupBy('mi.name')
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })
      .orderBy(exprFullName, 'ASC')
      .addOrderBy('mi.name', 'ASC');

    // Phân trang tương tự các service khác (giới hạn tối đa 10)
    qb.offset((page - 1) * limit).limit(limit);


    // if (q.createdBy) qb.andWhere('creator.id = :cid', { cid: q.createdBy });
    // Nếu truyền createdBy (thực chất là staffId), bắt cả hai vai trò
    if (q.createdBy) {
      qb.andWhere('(cash.id = :sid OR creator.id = :sid)', { sid: q.createdBy });
    }

    if (q.tableId) qb.andWhere('o.tableId = :tid', { tid: q.tableId });
    if (q.q) qb.andWhere('mi.name ILIKE :q', { q: `%${q.q}%` });
    if (q.categoryIds?.length) qb.andWhere('c.id IN (:...cids)', { cids: q.categoryIds });

    const raw = await qb.getRawMany<{
      userId: string; fullName: string; itemCode: string; itemName: string;
      soldQty: string; goodsAmount: string; allocatedDiscount: string; netRevenue: string;
    }>();

    // ===== gom theo staff =====
    const groups: Array<{
      userId: string; fullName: string;
      totals: { soldQty: number; goodsAmount: number; discount: number; netRevenue: number };
      items: Array<{ itemCode: string; itemName: string; soldQty: number; goodsAmount: number; discount: number; netRevenue: number }>;
    }> = [];
    const idx = new Map<string, number>();

    for (const r of raw) {
      const k = r.userId || 'null';
      let i = idx.get(k);
      if (i == null) {
        i = groups.length; idx.set(k, i);
        groups.push({
          userId: r.userId, fullName: r.fullName,
          totals: { soldQty: 0, goodsAmount: 0, discount: 0, netRevenue: 0 },
          items: [],
        });
      }
      const soldQty = Number(r.soldQty || 0);
      const goods = Number(r.goodsAmount || 0);
      const discount = Number(r.allocatedDiscount || 0);
      const net = Number(r.netRevenue || 0);

      groups[i].items.push({
        itemCode: r.itemCode, itemName: r.itemName,
        soldQty, goodsAmount: goods, discount, netRevenue: net,
      });

      const t = groups[i].totals;
      t.soldQty += soldQty;
      t.goodsAmount += goods;
      t.discount += discount;
      t.netRevenue += net;
    }

    const header = groups.reduce((a, g) => ({
      staffCount: a.staffCount + 1,
      soldQty: a.soldQty + g.totals.soldQty,
      goodsAmount: a.goodsAmount + g.totals.goodsAmount,
      discount: a.discount + g.totals.discount,
      netRevenue: a.netRevenue + g.totals.netRevenue,
    }), { staffCount: 0, soldQty: 0, goodsAmount: 0, discount: 0, netRevenue: 0 });

    return { printedAt: new Date().toISOString(), dateRange: { from, to }, header, groups };
  }

  /* ====== BÁN HÀNG THEO KHÁCH (DANH SÁCH GIAO DỊCH) ====== */
  async customerSales(q: { dateFrom?: string; dateTo?: string; customerId?: string; customerQ?: string; page?: number; limit?: number; }) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10, Math.max(1, Number(q.limit) || 10));

    // Đếm số hóa đơn của KH trong khoảng
    const countQb = this.invRepo.createQueryBuilder('inv')
      .leftJoin('inv.order', 'o')
      .leftJoin('inv.customer', 'cus')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID });
    if (q.customerId) countQb.andWhere('cus.id = :cid', { cid: q.customerId });
    if (q.customerQ) countQb.andWhere('(cus.code ILIKE :cq OR cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
    // Tổng số hóa đơn
    const total = Number((await countQb.select('COUNT(inv.id)', 'c').getRawOne<{ c: string }>())?.c || 0);
    // Đếm khách: khách có ID (distinct cus.id) + mỗi hóa đơn KHÁCH LẺ (cus.id IS NULL) tính là 1 khách riêng
    const customerStatsQb = this.invRepo.createQueryBuilder('inv')
      .leftJoin('inv.customer', 'cus')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID });
    if (q.customerId) customerStatsQb.andWhere('cus.id = :cid', { cid: q.customerId });
    if (q.customerQ) customerStatsQb.andWhere('(cus.code ILIKE :cq OR cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
    const customerStats = await customerStatsQb
      .select('COUNT(DISTINCT cus.id)', 'registeredDistinct')
      .addSelect(`COUNT(*) FILTER (WHERE cus.id IS NULL)`, 'walkInInvoices')
      .getRawOne<{ registeredDistinct: string; walkInInvoices: string }>();
    const registeredCustomers = Number(customerStats?.registeredDistinct || 0);
    const walkInCustomers = Number(customerStats?.walkInInvoices || 0); // mỗi hóa đơn lẻ = 1 khách
    const customersCount = registeredCustomers + walkInCustomers;

    // Chi tiết từng hóa đơn
    const qb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .leftJoin('inv.payments', 'pay')
      .leftJoin('inv.customer', 'cus')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })
      .select('inv.invoiceNumber', 'invoiceNumber')
      .addSelect(`to_char(inv.created_at,'HH24:MI')`, 'time')
      .addSelect('inv.created_at', 'occurredAt')
      .addSelect('cus.id', 'customerId')
      .addSelect('cus.name', 'customerName')
      .addSelect('SUM(oi.quantity)', 'itemsCount')
      .addSelect('SUM(oi.quantity * oi.price)', 'goodsAmount')
      .addSelect('COALESCE(inv.discountTotal,0)', 'invoiceDiscount')
      .addSelect('SUM(oi.quantity * oi.price) - COALESCE(inv.discountTotal,0)', 'netRevenue')
      .groupBy('inv.id, cus.id, cus.name, to_char(inv.created_at,\'HH24:MI\')')
      .orderBy('inv.createdAt', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);
    if (q.customerId) qb.andWhere('cus.id = :cid', { cid: q.customerId });
    if (q.customerQ) qb.andWhere('(cus.code ILIKE :cq OR cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
    const rows = await qb.getRawMany<{
      invoiceNumber: string; time: string; occurredAt: string; customerId: string; customerName: string; itemsCount: string; goodsAmount: string; invoiceDiscount: string; netRevenue: string;
    }>();
    const sum = rows.reduce((a, r) => ({
      itemsCount: a.itemsCount + Number(r.itemsCount || 0),
      goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
      invoiceDiscount: a.invoiceDiscount + Number(r.invoiceDiscount || 0),
      netRevenue: a.netRevenue + Number(r.netRevenue || 0),
    }), { itemsCount: 0, goodsAmount: 0, invoiceDiscount: 0, netRevenue: 0 });
    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      customerFilter: { customerId: q.customerId || null, customerQ: q.customerQ || null },
      customersCount,
      registeredCustomers,
      walkInCustomers,
      sum,
      rows,
    }, { total, page, limit, pages: Math.ceil(total / limit) });
  }

  /* ====== TOP NHÀ CUNG CẤP (ĐÃ TRỪ TRẢ HÀNG) ====== */
  async suppliersTop(q: SupplierReportQueryDto) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const limit = Math.min(10, Math.max(1, Number(q.topLimit) || 10));

    // Tổng tiền mua = (tổng tiền hàng - giảm giá phiếu) + phí vận chuyển
    // Trả hàng: refundAmount (đã sau giảm trên phiếu trả)
    // Net = purchases - returns
    const fromDate = this.fmtYMD(from);
    const toDate = this.fmtYMD(to);
    const purchaseQb = this.ds.createQueryBuilder()
      .from('purchase_receipts', 'pr')
      .select('pr.supplier_id', 'supplierId')
      .addSelect(`SUM((
          (SELECT COALESCE(SUM(ri.quantity * ri."unitPrice" - CASE WHEN ri."discountType" = 'PERCENT' THEN (ri.quantity * ri."unitPrice") * ri."discountValue" / 100 ELSE ri."discountValue" END),0)
             FROM purchase_receipt_items ri
            WHERE ri.receipt_id = pr.id)
          - CASE WHEN pr."globalDiscountType" = 'PERCENT' THEN (SELECT COALESCE(SUM(ri2.quantity * ri2."unitPrice" - CASE WHEN ri2."discountType" = 'PERCENT' THEN (ri2.quantity * ri2."unitPrice") * ri2."discountValue" / 100 ELSE ri2."discountValue" END),0) FROM purchase_receipt_items ri2 WHERE ri2.receipt_id = pr.id) * pr."globalDiscountValue" / 100 ELSE pr."globalDiscountValue" END
          + pr."shippingFee"
        ))`, 'purchaseAmount')
      .where('pr.status IN (:...sts)', { sts: ['POSTED', 'PAID', 'OWING'] })
      .andWhere('pr."receiptDate" >= :fromDate AND pr."receiptDate" < :toDate', { fromDate, toDate })
      .groupBy('pr.supplier_id');

    const returnQb = this.ds.createQueryBuilder()
      .from('purchase_returns', 'ret')
      .select('ret.supplier_id', 'supplierId')
      .addSelect('SUM(ret."refundAmount")', 'returnAmount')
      .where('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] })
      .andWhere('ret."createdAt" >= :from AND ret."createdAt" < :to', { from, to })
      .groupBy('ret.supplier_id');

    const qb = this.ds.createQueryBuilder()
      .from('suppliers', 'sup')
      .leftJoin('(' + purchaseQb.getQuery() + ')', 'p', 'p."supplierId" = sup.id')
      .leftJoin('(' + returnQb.getQuery() + ')', 'r', 'r."supplierId" = sup.id')
      .select('sup.id', 'supplierId')
      .addSelect('sup.code', 'code')
      .addSelect('sup.name', 'name')
      .addSelect('COALESCE(p."purchaseAmount",0)', 'purchaseAmount')
      .addSelect('COALESCE(r."returnAmount",0)', 'returnAmount')
      .addSelect('(COALESCE(p."purchaseAmount",0) - COALESCE(r."returnAmount",0))', 'netAmount')
      // Chỉ lấy NCC có phát sinh mua hoặc trả trong khoảng thời gian
      .where('(COALESCE(p."purchaseAmount",0) <> 0 OR COALESCE(r."returnAmount",0) <> 0)')
      .orderBy('"netAmount"', 'DESC')
      .limit(limit)
      .setParameters({ ...purchaseQb.getParameters(), ...returnQb.getParameters() });
    // Áp dụng filter NCC nếu có
    if (q.supplierId) qb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) qb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });
    const rows = await qb.getRawMany<{ supplierId: string; code: string; name: string; purchaseAmount: string; returnAmount: string; netAmount: string; }>();
    const data = rows.map(r => ({
      supplierId: r.supplierId,
      code: r.code, name: r.name,
      purchaseAmount: Number(r.purchaseAmount || 0),
      returnAmount: Number(r.returnAmount || 0),
      netAmount: Number(r.netAmount || 0),
    }));
    const header = data.reduce((a, x) => ({
      supplierCount: a.supplierCount + 1,
      purchaseAmount: a.purchaseAmount + x.purchaseAmount,
      returnAmount: a.returnAmount + x.returnAmount,
      netAmount: a.netAmount + x.netAmount,
    }), { supplierCount: 0, purchaseAmount: 0, returnAmount: 0, netAmount: 0 });
    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      rows: data,
    });
  }

  /* ====== NHẬP HÀNG THEO NHÀ CUNG CẤP (CHI TIẾT PHIẾU) ====== */
  /* ====== NHẬP HÀNG THEO NHÀ CUNG CẤP (CHI TIẾT PHIẾU, CHỈ NHẬP) ====== */
  async purchasesBySupplier(q: SupplierReportQueryDto) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const fromDate = this.fmtYMD(from);
    const toDate = this.fmtYMD(to);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10, Math.max(1, Number(q.limit) || 10));

    // Đếm số phiếu nhập
    const countQb = this.ds.createQueryBuilder()
      .from('purchase_receipts', 'pr')
      .innerJoin('suppliers', 'sup', 'sup.id = pr.supplier_id')
      .where('pr."receiptDate" >= :fromDate AND pr."receiptDate" < :toDate', { fromDate, toDate })
      .andWhere('pr.status IN (:...sts)', { sts: ['POSTED', 'PAID', 'OWING'] });

    if (q.supplierId) countQb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) countQb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });

    const total = Number((await countQb.select('COUNT(pr.id)', 'c').getRawOne<{ c: string }>())?.c || 0);

    // Tổng tiền hàng sau giảm ở cấp dòng
    const lineNetExpr = `ri.quantity * ri."unitPrice"
    - CASE WHEN ri."discountType" = 'PERCENT'
           THEN (ri.quantity * ri."unitPrice") * ri."discountValue" / 100
           ELSE ri."discountValue" END`;

    const receiptGoodsExpr = `(
    SELECT COALESCE(SUM(${lineNetExpr}),0)
      FROM purchase_receipt_items ri
     WHERE ri.receipt_id = pr.id
  )`;

    const receiptDiscountExpr = `
    CASE
      WHEN pr."globalDiscountType" = 'PERCENT'
        THEN (${receiptGoodsExpr}) * pr."globalDiscountValue" / 100
      ELSE pr."globalDiscountValue"
    END`;

    const receiptTotalExpr = `(${receiptGoodsExpr}) - ${receiptDiscountExpr} + pr."shippingFee"`;

    const qb = this.ds.createQueryBuilder()
      .from('purchase_receipts', 'pr')
      .innerJoin('suppliers', 'sup', 'sup.id = pr.supplier_id')
      .leftJoin('users', 'u', 'u.id = pr.created_by_id')
      .leftJoin('profiles', 'pf', 'pf.user_id = u.id')
      .select('sup.id', 'supplierId')
      .addSelect('sup.name', 'supplierName')
      .addSelect('pr.id', 'receiptId')
      .addSelect('pr.code', 'receiptCode')
      .addSelect('pr."receiptDate"', 'receiptDate')
      .addSelect(`to_char(pr."createdAt",'HH24:MI')`, 'time')
      .addSelect('pr."createdAt"', 'occurredAt')
      .addSelect(`(${receiptGoodsExpr})`, 'goodsAmount')
      .addSelect(receiptDiscountExpr, 'invoiceDiscount')
      .addSelect(`(${receiptGoodsExpr}) - ${receiptDiscountExpr}`, 'netGoods')
      .addSelect('pr."shippingFee"', 'shippingFee')
      .addSelect(receiptTotalExpr, 'totalAmount')
      .addSelect('pf.full_name', 'creatorName')
      .where('pr."receiptDate" >= :fromDate AND pr."receiptDate" < :toDate', { fromDate, toDate })
      .andWhere('pr.status IN (:...sts)', { sts: ['POSTED', 'PAID', 'OWING'] })
      .orderBy('pr."receiptDate"', 'ASC')
      .addOrderBy('pr."createdAt"', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (q.supplierId) qb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) qb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });

    const rows = await qb.getRawMany<{
      supplierId: string; supplierName: string;
      receiptId: string; receiptCode: string;
      receiptDate: string; time: string; occurredAt: string;
      goodsAmount: string; invoiceDiscount: string; netGoods: string;
      shippingFee: string; totalAmount: string; creatorName: string;
    }>();

    // Gom theo NCC
    const groupsMap = new Map<string, {
      supplierId: string; supplierName: string;
      totals: {
        goodsAmount: number; invoiceDiscount: number; netGoods: number;
        shippingFee: number; totalAmount: number; receiptCount: number;
      };
      rows: any[];
    }>();

    for (const r of rows) {
      const g = groupsMap.get(r.supplierId) || {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totals: {
          goodsAmount: 0,
          invoiceDiscount: 0,
          netGoods: 0,
          shippingFee: 0,
          totalAmount: 0,
          receiptCount: 0,
        },
        rows: [],
      };

      const goods = Number(r.goodsAmount || 0);
      const disc = Number(r.invoiceDiscount || 0);
      const netGoods = Number(r.netGoods || 0);
      const ship = Number(r.shippingFee || 0);
      const totalAmt = Number(r.totalAmount || 0);

      g.rows.push({
        receiptId: r.receiptId,
        receiptCode: r.receiptCode,
        receiptDate: r.receiptDate,
        time: r.time,
        occurredAt: r.occurredAt,
        goodsAmount: goods,
        invoiceDiscount: disc,
        netGoods,
        shippingFee: ship,
        totalAmount: totalAmt,
        creatorName: r.creatorName,
      });

      g.totals.goodsAmount += goods;
      g.totals.invoiceDiscount += disc;
      g.totals.netGoods += netGoods;
      g.totals.shippingFee += ship;
      g.totals.totalAmount += totalAmt;
      g.totals.receiptCount += 1;

      groupsMap.set(r.supplierId, g);
    }

    const groups = [...groupsMap.values()];

    const header = groups.reduce((a, g) => ({
      supplierCount: a.supplierCount + 1,
      goodsAmount: a.goodsAmount + g.totals.goodsAmount,
      invoiceDiscount: a.invoiceDiscount + g.totals.invoiceDiscount,
      netGoods: a.netGoods + g.totals.netGoods,
      shippingFee: a.shippingFee + g.totals.shippingFee,
      totalAmount: a.totalAmount + g.totals.totalAmount,
      receiptCount: a.receiptCount + g.totals.receiptCount,
    }), {
      supplierCount: 0,
      goodsAmount: 0,
      invoiceDiscount: 0,
      netGoods: 0,
      shippingFee: 0,
      totalAmount: 0,
      receiptCount: 0,
    });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      groups,
    }, { total, page, limit, pages: Math.ceil(total / limit) });
  }

  /* ====== TRẢ HÀNG THEO NHÀ CUNG CẤP (CHI TIẾT PHIẾU TRẢ) ====== */
  async purchaseReturnsBySupplier(q: SupplierReportQueryDto) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10, Math.max(1, Number(q.limit) || 10));

    // Đếm số phiếu trả
    const countQb = this.ds.createQueryBuilder()
      .from('purchase_returns', 'ret')
      .innerJoin('suppliers', 'sup', 'sup.id = ret.supplier_id')
      .where('ret."createdAt" >= :from AND ret."createdAt" < :to', { from, to })
      .andWhere('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] });

    if (q.supplierId) countQb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) countQb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });

    const total = Number((await countQb.select('COUNT(ret.id)', 'c').getRawOne<{ c: string }>())?.c || 0);

    // Chi tiết phiếu trả
    const returnDetailRows = await this.ds.createQueryBuilder()
      .from('purchase_returns', 'ret')
      .innerJoin('suppliers', 'sup', 'sup.id = ret.supplier_id')
      .leftJoin('purchase_return_logs', 'rl', 'rl.purchase_return_id = ret.id')
      .select('sup.id', 'supplierId')
      .addSelect('sup.name', 'supplierName')
      .addSelect('ret.id', 'returnId')
      .addSelect('ret.code', 'returnCode')
      .addSelect(`to_char(ret."createdAt",'HH24:MI')`, 'time')
      .addSelect('ret."createdAt"', 'occurredAt')
      .addSelect('COALESCE(SUM(rl."baseQty"),0)', 'returnQtyBase') // baseQty để quản lý kho
      .addSelect('ret."refundAmount"', 'refundAmount')
      .where('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] })
      .andWhere('ret."createdAt" >= :from AND ret."createdAt" < :to', { from, to })
      .groupBy('sup.id, sup.name, ret.id, ret.code, ret."createdAt", ret."refundAmount"')
      .orderBy('ret."createdAt"', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        supplierId: string; supplierName: string;
        returnId: string; returnCode: string;
        time: string; occurredAt: string;
        returnQtyBase: string; refundAmount: string;
      }>();

    // Chi tiết mặt hàng trong phiếu trả (uom user chọn + baseQty)
    const returnItemRows = await this.ds.createQueryBuilder()
      .from('purchase_return_logs', 'rl')
      .innerJoin('purchase_returns', 'ret', 'ret.id = rl.purchase_return_id')
      .innerJoin('inventory_items', 'ii', 'ii.id = rl.item_id')
      .leftJoin('units_of_measure', 'uom', 'uom.code = rl.uom_code')
      .select('ret.id', 'returnId')
      .addSelect('rl.item_id', 'itemId')
      .addSelect('ii.name', 'itemName')
      .addSelect('uom.code', 'uomCode')
      .addSelect('uom.name', 'uomName')
      .addSelect('COALESCE(SUM(rl.quantity),0)', 'qty')      // theo đơn vị nhập lúc trả
      .addSelect('COALESCE(SUM(rl."baseQty"),0)', 'baseQty') // theo đơn vị base
      .where('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] })
      .andWhere('rl."performedAt" >= :from AND rl."performedAt" < :to', { from, to })
      .groupBy('ret.id, rl.item_id, ii.name, uom.code, uom.name')
      .getRawMany<{
        returnId: string; itemId: string; itemName: string;
        uomCode: string | null; uomName: string | null;
        qty: string; baseQty: string;
      }>();

    const itemsByReturn = new Map<string, any[]>();
    for (const r of returnItemRows) {
      const list = itemsByReturn.get(r.returnId) || [];
      list.push({
        itemId: r.itemId,
        itemName: r.itemName,
        qty: Number(r.qty || 0),
        baseQty: Number(r.baseQty || 0),
        uomCode: r.uomCode,
        uomName: r.uomName,
      });
      itemsByReturn.set(r.returnId, list);
    }

    // Gom theo NCC
    const groupsMap = new Map<string, {
      supplierId: string; supplierName: string;
      totals: { returnQtyBase: number; returnAmount: number; returnCount: number; };
      returns: any[];
    }>();

    for (const r of returnDetailRows) {
      const g = groupsMap.get(r.supplierId) || {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totals: { returnQtyBase: 0, returnAmount: 0, returnCount: 0 },
        returns: [],
      };

      const qtyBase = Number(r.returnQtyBase || 0);
      const refundAmt = Number(r.refundAmount || 0);

      g.returns.push({
        returnId: r.returnId,
        returnCode: r.returnCode,
        time: r.time,
        occurredAt: r.occurredAt,
        returnQtyBase: qtyBase,
        refundAmount: refundAmt,
        items: itemsByReturn.get(r.returnId) || [],
      });

      g.totals.returnQtyBase += qtyBase;
      g.totals.returnAmount += refundAmt;
      g.totals.returnCount += 1;

      groupsMap.set(r.supplierId, g);
    }

    const groups = [...groupsMap.values()];

    const header = groups.reduce((a, g) => ({
      supplierCount: a.supplierCount + 1,
      returnQtyBase: a.returnQtyBase + g.totals.returnQtyBase,
      returnAmount: a.returnAmount + g.totals.returnAmount,
      returnCount: a.returnCount + g.totals.returnCount,
    }), {
      supplierCount: 0,
      returnQtyBase: 0,
      returnAmount: 0,
      returnCount: 0,
    });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      groups,
    }, { total, page, limit, pages: Math.ceil(total / limit) });
  }


  /* ====== MẶT HÀNG NHẬP THEO NHÀ CUNG CẤP ====== */
  async purchasesBySupplierItems(q: SupplierReportQueryDto) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const fromDate = this.fmtYMD(from);
    const toDate = this.fmtYMD(to);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10, Math.max(1, Number(q.limit) || 10));

    const lineNetExpr = `ri.quantity * ri."unitPrice"
    - CASE WHEN ri."discountType" = 'PERCENT'
           THEN (ri.quantity * ri."unitPrice") * ri."discountValue" / 100
           ELSE ri."discountValue" END`;

    const goodsSumSub = this.ds.createQueryBuilder()
      .from('purchase_receipt_items', 'ri2')
      .select('ri2.receipt_id', 'rid')
      .addSelect(`SUM(
      ri2.quantity * ri2."unitPrice"
      - CASE WHEN ri2."discountType" = 'PERCENT'
             THEN (ri2.quantity * ri2."unitPrice") * ri2."discountValue" / 100
             ELSE ri2."discountValue" END
    )`, 'goodsTotal')
      .groupBy('ri2.receipt_id');

    const headerDiscountPerReceipt = `
    CASE
      WHEN pr."globalDiscountType" = 'PERCENT'
        THEN COALESCE(g."goodsTotal",0) * pr."globalDiscountValue" / 100
      ELSE pr."globalDiscountValue"
    END`;

    const allocatedHeaderDiscountExpr = `
    CASE
      WHEN COALESCE(g."goodsTotal",0) = 0 THEN 0
      ELSE (${lineNetExpr}) / g."goodsTotal" * (${headerDiscountPerReceipt})
    END`;

    const qb = this.ds.createQueryBuilder()
      .from('purchase_receipt_items', 'ri')
      .innerJoin('purchase_receipts', 'pr', 'pr.id = ri.receipt_id')
      .innerJoin('suppliers', 'sup', 'sup.id = pr.supplier_id')
      .innerJoin('inventory_items', 'ii', 'ii.id = ri.item_id')
      // Đơn vị thực tế lúc nhập (đơn vị trên dòng phiếu)
      .leftJoin('units_of_measure', 'uom', 'uom.code = ri.received_uom_code')
      // Đơn vị cơ sở của hàng hóa
      .leftJoin('units_of_measure', 'uomb', 'uomb.code = ii.base_uom_code')
      .leftJoin('(' + goodsSumSub.getQuery() + ')', 'g', 'g."rid" = pr.id')
      .select('sup.id', 'supplierId')
      .addSelect('sup.name', 'supplierName')
      .addSelect('ii.id', 'itemId')
      .addSelect('ii.name', 'itemName')
      .addSelect('uom.code', 'uomCode')
      .addSelect('uom.name', 'uomName')
      .addSelect('uomb.code', 'baseUomCode')
      .addSelect('uomb.name', 'baseUomName')
      .addSelect('SUM(ri.quantity)', 'purchaseQty')
      .addSelect('SUM(ri.quantity * ri."conversionToBase")', 'baseQty')
      .addSelect(`SUM(${lineNetExpr})`, 'goodsAmount')
      .addSelect(`SUM(${allocatedHeaderDiscountExpr})`, 'allocatedHeaderDiscount')
      .addSelect(`SUM(${lineNetExpr}) - SUM(${allocatedHeaderDiscountExpr})`, 'netGoods')
      .where('pr."receiptDate" >= :fromDate AND pr."receiptDate" < :toDate', { fromDate, toDate })
      .andWhere('pr.status IN (:...sts)', { sts: ['POSTED', 'PAID', 'OWING'] })
      .groupBy('sup.id, sup.name, ii.id, ii.name, uom.code, uom.name, uomb.code, uomb.name')
      .orderBy('sup.name', 'ASC')
      .addOrderBy('ii.name', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .setParameters({ ...goodsSumSub.getParameters() });

    if (q.supplierId) qb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) qb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });

    const rows = await qb.getRawMany<{
      supplierId: string; supplierName: string; itemId: string; itemName: string;
      uomCode: string | null; uomName: string | null;
      baseUomCode: string | null; baseUomName: string | null;
      purchaseQty: string; baseQty: string; goodsAmount: string; allocatedHeaderDiscount: string; netGoods: string;
    }>();

    // Lấy số lượng TRẢ theo đơn vị thực tế (gom theo NCC + mặt hàng + UOM)
    const returnUomRows = await this.ds.createQueryBuilder()
      .from('purchase_return_logs', 'rl')
      .innerJoin('purchase_returns', 'ret', 'ret.id = rl.purchase_return_id')
      .leftJoin('units_of_measure', 'ru', 'ru.code = rl.uom_code')
      .select('ret.supplier_id', 'supplierId')
      .addSelect('rl.item_id', 'itemId')
      .addSelect('ru.code', 'uomCode')
      .addSelect('ru.name', 'uomName')
      .addSelect('SUM(rl.quantity)', 'qty')
      .where('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] })
      .andWhere('rl."performedAt" >= :from AND rl."performedAt" < :to', { from, to })
      .groupBy('ret.supplier_id, rl.item_id, ru.code, ru.name')
      .getRawMany<{
        supplierId: string; itemId: string; uomCode: string | null; uomName: string | null; qty: string;
      }>();

    const returnUomMap = new Map<string, Array<{ uomCode: string | null; uomName: string | null; qty: number }>>();
    for (const r of returnUomRows) {
      const k = `${r.supplierId}|${r.itemId}`;
      const arr = returnUomMap.get(k) || [];
      arr.push({ uomCode: r.uomCode, uomName: r.uomName, qty: Number(r.qty || 0) });
      returnUomMap.set(k, arr);
    }

    const map = new Map<string, {
      supplierId: string; supplierName: string;
      totals: {
        purchaseQty: number; baseQty: number; goodsAmount: number; headerDiscount: number; netGoods: number;
        itemCount: number;
      };
      items: any[];
    }>();

    for (const r of rows) {
      const g = map.get(r.supplierId) || {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totals: {
          purchaseQty: 0,
          baseQty: 0,
          goodsAmount: 0,
          headerDiscount: 0,
          netGoods: 0,
          itemCount: 0,
        },
        items: [],
      };

      const purchaseQty = Number(r.purchaseQty || 0);
      const goodsAmount = Number(r.goodsAmount || 0);
      const baseQty = Number(r.baseQty || 0);
      const headerDiscount = Number(r.allocatedHeaderDiscount || 0);
      const netGoods = Number(r.netGoods || 0);

      g.items.push({
        itemId: r.itemId,
        itemName: r.itemName,
        uomCode: r.uomCode,
        uomName: r.uomName,
        baseUomCode: r.baseUomCode,
        baseUomName: r.baseUomName,
        purchaseQty,
        baseQty,
        goodsAmount,
        headerDiscount,
        netGoods,
        // Danh sách UOM trả thực tế
        returnByUom: returnUomMap.get(`${r.supplierId}|${r.itemId}`) || [],
      });

      g.totals.purchaseQty += purchaseQty;
      g.totals.baseQty += baseQty;
      g.totals.goodsAmount += goodsAmount;
      g.totals.headerDiscount += headerDiscount;
      g.totals.netGoods += netGoods;
      g.totals.itemCount += 1;

      map.set(r.supplierId, g);
    }

    const groups = [...map.values()];

    const header = groups.reduce((a, g) => ({
      supplierCount: a.supplierCount + 1,
      purchaseQty: a.purchaseQty + g.totals.purchaseQty,
      baseQty: a.baseQty + g.totals.baseQty,
      goodsAmount: a.goodsAmount + g.totals.goodsAmount,
      headerDiscount: a.headerDiscount + g.totals.headerDiscount,
      netGoods: a.netGoods + g.totals.netGoods,
      itemCount: a.itemCount + g.totals.itemCount,
    }), {
      supplierCount: 0,
      purchaseQty: 0,
      baseQty: 0,
      goodsAmount: 0,
      headerDiscount: 0,
      netGoods: 0,
      itemCount: 0,
    });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      groups,
    }, { total: rows.length, page, limit, pages: Math.ceil(rows.length / limit) });
  }


  /* ====== MẶT HÀNG TRẢ HÀNG THEO NHÀ CUNG CẤP ====== */
  async purchaseReturnItemsBySupplier(q: SupplierReportQueryDto) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(10, Math.max(1, Number(q.limit) || 10));

    const qb = this.ds.createQueryBuilder()
      .from('purchase_return_logs', 'rl')
      .innerJoin('purchase_returns', 'ret', 'ret.id = rl.purchase_return_id')
      .innerJoin('suppliers', 'sup', 'sup.id = ret.supplier_id')
      .innerJoin('inventory_items', 'ii', 'ii.id = rl.item_id')
      .leftJoin('units_of_measure', 'uom', 'uom.code = rl.uom_code')
      .select('sup.id', 'supplierId')
      .addSelect('sup.name', 'supplierName')
      .addSelect('ii.id', 'itemId')
      .addSelect('ii.name', 'itemName')
      .addSelect('uom.code', 'uomCode')
      .addSelect('uom.name', 'uomName')
      .addSelect('SUM(rl.quantity)', 'returnQty')      // theo đơn vị user chọn
      .addSelect('SUM(rl."baseQty")', 'returnBaseQty') // theo đơn vị base
      .addSelect('SUM(rl."refundAmount")', 'refundAmount')
      .where('ret.status IN (:...rst)', { rst: ['POSTED', 'REFUNDED'] })
      .andWhere('rl."performedAt" >= :from AND rl."performedAt" < :to', { from, to })
      .groupBy('sup.id, sup.name, ii.id, ii.name, uom.code, uom.name')
      .orderBy('sup.name', 'ASC')
      .addOrderBy('ii.name', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (q.supplierId) qb.andWhere('sup.id = :sid', { sid: q.supplierId });
    if (q.supplierQ) qb.andWhere('(sup.code ILIKE :sq OR sup.name ILIKE :sq OR sup.phone ILIKE :sq)', { sq: `%${q.supplierQ}%` });

    const rows = await qb.getRawMany<{
      supplierId: string; supplierName: string; itemId: string; itemName: string;
      uomCode: string | null; uomName: string | null;
      returnQty: string; returnBaseQty: string; refundAmount: string;
    }>();

    const map = new Map<string, {
      supplierId: string; supplierName: string;
      totals: { returnQty: number; returnBaseQty: number; refundAmount: number; itemCount: number; };
      items: any[];
    }>();

    for (const r of rows) {
      const g = map.get(r.supplierId) || {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totals: { returnQty: 0, returnBaseQty: 0, refundAmount: 0, itemCount: 0 },
        items: [],
      };

      const qty = Number(r.returnQty || 0);
      const baseQty = Number(r.returnBaseQty || 0);
      const refund = Number(r.refundAmount || 0);

      g.items.push({
        itemId: r.itemId,
        itemName: r.itemName,
        uomCode: r.uomCode,
        uomName: r.uomName,
        returnQty: qty,
        returnBaseQty: baseQty,
        refundAmount: refund,
      });

      g.totals.returnQty += qty;
      g.totals.returnBaseQty += baseQty;
      g.totals.refundAmount += refund;
      g.totals.itemCount += 1;

      map.set(r.supplierId, g);
    }

    const groups = [...map.values()];

    const header = groups.reduce((a, g) => ({
      supplierCount: a.supplierCount + 1,
      returnQty: a.returnQty + g.totals.returnQty,
      returnBaseQty: a.returnBaseQty + g.totals.returnBaseQty,
      refundAmount: a.refundAmount + g.totals.refundAmount,
      itemCount: a.itemCount + g.totals.itemCount,
    }), {
      supplierCount: 0,
      returnQty: 0,
      returnBaseQty: 0,
      refundAmount: 0,
      itemCount: 0,
    });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      groups,
    }, { total: rows.length, page, limit, pages: Math.ceil(rows.length / limit) });
  }

  /* ====== LỢI NHUẬN: THEO NGÀY (BIỂU ĐỒ/TỔNG HỢP) ====== */
  async profitDaily(q: { dateFrom?: string; dateTo?: string; granularity?: 'day' }) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const goodsExpr = 'oi.quantity * oi.price';
    // Chi phí nguyên liệu cho 1 suất của món (cộng avgCost của từng NVL theo định lượng)
    const recipeCostPerOne = `(
      SELECT COALESCE(SUM(ing.quantity * ii."avgCost"),0)
        FROM ingredients ing
        JOIN inventory_items ii ON ii.id = ing."inventoryItemId"
       WHERE ing."menuItemId" = mi.id
    )`;
    const cogsExpr = `(oi.quantity * ${recipeCostPerOne})`;

    // 1) Hàng và COGS (từ order_items)
    const goodsRows = await this.oiRepo.createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('o.invoice', 'inv')
      .innerJoin('oi.menuItem', 'mi')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`, 'd')
      .addSelect(`SUM(${goodsExpr})`, 'goods')
      .addSelect(`SUM(${cogsExpr})`, 'cogs')
      .groupBy(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`)
      .orderBy(`MIN(inv.created_at)`, 'ASC')
      .getRawMany<{ d: string; goods: string; cogs: string }>();

    // 2) Giảm giá theo hóa đơn (mỗi invoice tính 1 lần)
    const discRows = await this.invRepo.createQueryBuilder('inv')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`, 'd')
      .addSelect('SUM(COALESCE(inv.discountTotal,0))', 'disc')
      .groupBy(`to_char(date_trunc('day', inv.created_at AT TIME ZONE '${this.TZ}'),'YYYY-MM-DD')`)
      .getRawMany<{ d: string; disc: string }>();

    const discMap = new Map(discRows.map(r => [r.d, Number(r.disc || 0)]));
    const points = goodsRows.map(r => {
      const goods = Number(r.goods || 0);
      const disc = discMap.get(r.d) ?? 0;
      const net = goods - disc;
      const cogs = Number(r.cogs || 0);
      const profit = net - cogs;
      return { date: r.d, revenue: net, cogs, profit };
    });

    const header = points.reduce((a, x) => ({
      days: a.days + 1,
      revenue: a.revenue + x.revenue,
      cogs: a.cogs + x.cogs,
      profit: a.profit + x.profit,
    }), { days: 0, revenue: 0, cogs: 0, profit: 0 });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      points,
    });
  }

  /* ====== LỢI NHUẬN: THEO HÓA ĐƠN (BẢNG) ====== */
  async profitByInvoice(q: { dateFrom?: string; dateTo?: string; page?: number; limit?: number; }) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 10));
    const goodsExpr = 'oi.quantity * oi.price';
    const recipeCostPerOne = `(
      SELECT COALESCE(SUM(ing.quantity * ii."avgCost"),0)
        FROM ingredients ing
        JOIN inventory_items ii ON ii.id = ing."inventoryItemId"
       WHERE ing."menuItemId" = mi.id
    )`;
    const cogsExpr = `(oi.quantity * ${recipeCostPerOne})`;

    // Đếm hóa đơn
    const total = Number((await this.invRepo.createQueryBuilder('inv')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select('COUNT(inv.id)', 'c').getRawOne<{ c: string }>()
    )?.c || 0);

    const rows = await this.oiRepo.createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('o.invoice', 'inv')
      .innerJoin('oi.menuItem', 'mi')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select('inv.invoiceNumber', 'invoiceNumber')
      .addSelect(`to_char(inv.created_at,'HH24:MI')`, 'time')
      .addSelect('inv.created_at', 'occurredAt')
      .addSelect(`SUM(${goodsExpr})`, 'goodsAmount')
      .addSelect('COALESCE(inv.discountTotal,0)', 'invoiceDiscount')
      .addSelect(`SUM(${goodsExpr}) - COALESCE(inv.discountTotal,0)`, 'netRevenue')
      .addSelect(`SUM(${cogsExpr})`, 'cogs')
      .addSelect(`(SUM(${goodsExpr}) - COALESCE(inv.discountTotal,0)) - SUM(${cogsExpr})`, 'grossProfit')
      .groupBy('inv.id, inv.invoice_number, inv.created_at, COALESCE(inv.discountTotal,0)')
      .orderBy('inv.createdAt', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        invoiceNumber: string; time: string; occurredAt: string;
        goodsAmount: string; invoiceDiscount: string; netRevenue: string; cogs: string; grossProfit: string;
      }>();

    const sum = rows.reduce((a, r) => ({
      goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
      invoiceDiscount: a.invoiceDiscount + Number(r.invoiceDiscount || 0),
      netRevenue: a.netRevenue + Number(r.netRevenue || 0),
      cogs: a.cogs + Number(r.cogs || 0),
      grossProfit: a.grossProfit + Number(r.grossProfit || 0),
    }), { goodsAmount: 0, invoiceDiscount: 0, netRevenue: 0, cogs: 0, grossProfit: 0 });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      sum,
      rows,
    }, { total, page, limit, pages: Math.ceil(total / limit) });
  }

  /* ====== GIẢM GIÁ HÓA ĐƠN: THEO HÓA ĐƠN ====== */
  async invoiceDiscounts(q: { dateFrom?: string; dateTo?: string; page?: number; limit?: number; paymentMethod?: string; areaId?: string; tableId?: string; customerQ?: string }) {
    const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 10));

    // COUNT distinct invoices
    const cntQb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .leftJoin('o.table', 't')
      .leftJoin('t.area', 'a')
      .leftJoin('inv.customer', 'cus')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })
      .select('COUNT(DISTINCT inv.id)', 'c');
    if (q.areaId) cntQb.andWhere('a.id = :aid', { aid: q.areaId });
    if (q.tableId) cntQb.andWhere('t.id = :tid', { tid: q.tableId });
    if (q.customerQ) cntQb.andWhere('(cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
    const total = Number((await cntQb.getRawOne<{ c: string }>())?.c || 0);

    // Main rows
    const goodsExpr = 'oi.quantity * oi.price';
    const qb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .leftJoin('o.createdBy', 'ur')
      .leftJoin('ur.profile', 'pf')
      .leftJoin('o.table', 't')
      .leftJoin('t.area', 'a')
      .leftJoin('inv.customer', 'cus')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })
      .select('inv.invoiceNumber', 'invoiceNumber')
      .addSelect(`to_char(inv.created_at,'DD/MM/YYYY HH24:MI')`, 'occurredAtStr')
      .addSelect(`to_char(inv.created_at,'HH24:MI')`, 'time')
      .addSelect('pf.fullName', 'receiverName')
      .addSelect('cus.name', 'customerName')
      .addSelect(`SUM(${goodsExpr})`, 'goodsAmount')
      .addSelect('COALESCE(inv.discountTotal,0)', 'invoiceDiscount')
      .groupBy('inv.id, inv.invoice_number, inv.created_at, pf.fullName, cus.name')
      .orderBy('inv.createdAt', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);
    if (q.areaId) qb.andWhere('a.id = :aid', { aid: q.areaId });
    if (q.tableId) qb.andWhere('t.id = :tid', { tid: q.tableId });
    if (q.customerQ) qb.andWhere('(cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
    const rows = await qb.getRawMany<{ invoiceNumber: string; time: string; occurredAtStr: string; receiverName: string | null; customerName: string | null; goodsAmount: string; invoiceDiscount: string }>();

    const header = rows.reduce((a, r) => ({
      transactionCount: a.transactionCount + 1,
      goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
      discountAmount: a.discountAmount + Number(r.invoiceDiscount || 0),
    }), { transactionCount: 0, goodsAmount: 0, discountAmount: 0 });

    return new ResponseCommon(200, true, 'OK', {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      header,
      rows,
    }, { total, page, limit, pages: Math.ceil(total / limit) });
  }


  // /* ====== HÀNG BÁN THEO KHÁCH (GOM THEO MÓN) ====== */
  // async customerSalesItems(q: {
  //   dateFrom?: string; dateTo?: string;
  //   customerId?: string; customerQ?: string;
  //   page?: number; limit?: number;
  // }) {
  //   const { from, to } = this.resolveLocalRange(q.dateFrom as any, q.dateTo as any);
  //   const page = Math.max(1, Number(q.page) || 1);
  //   const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));

  //   /** ================== BÁN HÀNG ================== */
  //   const goodsExpr = 'oi.quantity * oi.price';
  //   const invGoodsTotal = `(
  //   SELECT SUM(oi3.quantity * oi3.price)
  //   FROM order_items oi3
  //   WHERE oi3."orderId" = o.id
  // )`;

  //   // Phân bổ KM mức ORDER
  //   const discOrder = `
  //   COALESCE(
  //     (${goodsExpr}) / NULLIF(${invGoodsTotal}, 0) *
  //     (SELECT COALESCE(SUM(ip."discountAmount"),0)
  //        FROM invoice_promotions ip
  //       WHERE ip.invoice_id = inv.id AND ip."applyWith" = 'ORDER'),
  //     0
  //   )
  // `;

  //   // Phân bổ KM mức CATEGORY
  //   const discCategory = `
  //   COALESCE((
  //     SELECT SUM(
  //       ip."discountAmount" * (${goodsExpr}) /
  //       NULLIF((
  //         SELECT SUM(oi2.quantity * oi2.price)
  //           FROM order_items oi2
  //           JOIN menu_items mi2 ON mi2.id = oi2."menuItemId"
  //          WHERE oi2."orderId" = o.id
  //            AND EXISTS (
  //              SELECT 1 FROM promotion_categories pc
  //               WHERE pc.promotion_id = ip.promotion_id
  //                 AND pc.category_id   = mi2."categoryId"
  //            )
  //       ), 0)
  //     )
  //       FROM invoice_promotions ip
  //      WHERE ip.invoice_id = inv.id
  //        AND ip."applyWith" = 'CATEGORY'
  //        AND EXISTS (
  //          SELECT 1 FROM promotion_categories pc
  //           WHERE pc.promotion_id = ip.promotion_id
  //             AND pc.category_id   = mi."categoryId"
  //        )
  //   ),0)
  // `;

  //   // Phân bổ KM mức ITEM
  //   const discItem = `
  //   COALESCE((
  //     SELECT SUM(
  //       ip."discountAmount" * (${goodsExpr}) /
  //       NULLIF((
  //         SELECT SUM(oi2.quantity * oi2.price)
  //           FROM order_items oi2
  //          WHERE oi2."orderId" = o.id
  //            AND EXISTS (
  //              SELECT 1 FROM promotion_items pi
  //               WHERE pi.promotion_id = ip.promotion_id
  //                 AND pi.item_id       = oi2."menuItemId"
  //            )
  //       ), 0)
  //     )
  //       FROM invoice_promotions ip
  //      WHERE ip.invoice_id = inv.id
  //        AND ip."applyWith" = 'ITEM'
  //        AND EXISTS (
  //          SELECT 1 FROM promotion_items pi
  //           WHERE pi.promotion_id = ip.promotion_id
  //             AND pi.item_id       = mi.id
  //        )
  //   ),0)
  // `;

  //   const orderDiscountExpr = `SUM(${discOrder})`;
  //   const categoryDiscountExpr = `SUM(${discCategory})`;
  //   const itemDiscountExpr = `SUM(${discItem})`;
  //   const allocatedDiscountExpr = `${orderDiscountExpr} + ${categoryDiscountExpr} + ${itemDiscountExpr}`;

  //   /** ================== PHIẾU TRẢ HÀNG (SALES RETURN) ==================
  //    *  Đổi tên bảng/cột ở khối này theo schema thực tế của bạn:
  //    *  - returns:          bảng phiếu trả (ví dụ: sales_returns)
  //    *  - return_items:     bảng dòng hàng trả (ví dụ: sales_return_items)
  //    *  - return_promotions: (nếu có) giảm giá trên phiếu trả, phân bổ theo tỉ lệ
  //    *
  //    *  Nếu hệ thống của bạn không có giảm giá trên phiếu trả => đặt allocatedReturnDiscount = 0.
  //    */
  //   const returnQb = this.ds
  //     .createQueryBuilder()
  //     .select('ri."menuItemId"', 'itemId')
  //     .addSelect('SUM(ri.quantity)', 'returnQty')
  //     // Tổng tiền hàng trả (gross)
  //     .addSelect('SUM(ri.quantity * ri.price)', 'returnGoodsAmount')

  //     // --- Nếu có giảm giá trên phiếu trả: phân bổ tỉ lệ theo tổng tiền hàng trả của phiếu ---
  //     .addSelect(`
  //     COALESCE(SUM(
  //       (
  //         (ri.quantity * ri.price) / NULLIF((
  //           SELECT SUM(ri2.quantity * ri2.price)
  //           FROM return_items ri2
  //           WHERE ri2.return_id = r.id
  //         ), 0)
  //       ) * (
  //         SELECT COALESCE(SUM(rp."discountAmount"),0)
  //         FROM return_promotions rp
  //         WHERE rp.return_id = r.id
  //       )
  //     ), 0)
  //   `, 'allocatedReturnDiscount')

  //     .from('returns', 'r')                 // TODO: đổi 'returns' -> tên bảng phiếu trả thực tế
  //     .innerJoin('return_items', 'ri', 'ri.return_id = r.id') // TODO: đổi 'return_items' -> bảng dòng hàng trả
  //     .leftJoin('customers', 'cus2', 'cus2.id = r.customer_id')
  //     .where('r.created_at >= :from AND r.created_at < :to', { from, to }) // TODO: đổi cột thời gian
  //     .andWhere('r.status = :rSt', { rSt: 'COMPLETED' })                   // TODO: đổi trạng thái hoàn tất nếu khác
  //     .groupBy('ri."menuItemId"');

  //   if (q.customerId) {
  //     returnQb.andWhere('r.customer_id = :cid', { cid: q.customerId });
  //   }
  //   if (q.customerQ) {
  //     returnQb.andWhere('(cus2.code ILIKE :cq OR cus2.name ILIKE :cq OR cus2.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
  //   }

  //   /** ================== MAIN QUERY ================== */
  //   const qb = this.oiRepo.createQueryBuilder('oi')
  //     .innerJoin('oi.order', 'o')
  //     .innerJoin('o.invoice', 'inv')
  //     .leftJoin('inv.customer', 'cus')
  //     .innerJoin('oi.menuItem', 'mi')
  //     .leftJoin('mi.category', 'c')
  //     .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
  //     .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })

  //     // Join subquery trả hàng theo item
  //     .leftJoin(
  //       '(' + returnQb.getQuery() + ')',
  //       'ret',
  //       'ret."itemId" = mi.id'
  //     )
  //     .setParameters(returnQb.getParameters())

  //     .select('mi.id', 'itemCode')
  //     .addSelect('mi.name', 'itemName')
  //     .addSelect('c.name', 'categoryName')

  //     // BÁN
  //     .addSelect('SUM(oi.quantity)', 'soldQty')
  //     .addSelect(`SUM(${goodsExpr})`, 'goodsAmount')
  //     .addSelect(orderDiscountExpr, 'discountOrder')
  //     .addSelect(categoryDiscountExpr, 'discountCategory')
  //     .addSelect(itemDiscountExpr, 'discountItem')
  //     .addSelect(allocatedDiscountExpr, 'allocatedDiscount')
  //     .addSelect(`SUM(${goodsExpr}) - (${allocatedDiscountExpr})`, 'salesNetRevenue') // Doanh thu sau KM

  //     // TRẢ
  //     .addSelect('COALESCE(ret."returnQty",0)', 'returnQty')
  //     .addSelect('COALESCE(ret."returnGoodsAmount",0)', 'returnGoodsAmount')
  //     .addSelect('COALESCE(ret."allocatedReturnDiscount",0)', 'allocatedReturnDiscount')
  //     .addSelect('(COALESCE(ret."returnGoodsAmount",0) - COALESCE(ret."allocatedReturnDiscount",0))', 'returnNetAmount')

  //     // DOANH THU THUẦN = Doanh thu (sau KM) - Giá trị trả (sau phân bổ)
  //     .addSelect(`(SUM(${goodsExpr}) - (${allocatedDiscountExpr})) - (COALESCE(ret."returnGoodsAmount",0) - COALESCE(ret."allocatedReturnDiscount",0))`, 'netRevenue')

  //     .groupBy('mi.id, mi.name, c.name, ret."returnQty", ret."returnGoodsAmount", ret."allocatedReturnDiscount"')
  //     .orderBy('mi.name', 'ASC')
  //     .offset((page - 1) * limit)
  //     .limit(limit);

  //   if (q.customerId) {
  //     qb.andWhere('cus.id = :cid', { cid: q.customerId });
  //   }
  //   if (q.customerQ) {
  //     qb.andWhere('(cus.code ILIKE :cq OR cus.name ILIKE :cq OR cus.phone ILIKE :cq)', { cq: `%${q.customerQ}%` });
  //   }

  //   const rows = await qb.getRawMany<{
  //     itemCode: string; itemName: string; categoryName: string | null;

  //     soldQty: string; goodsAmount: string;
  //     discountOrder: string; discountCategory: string; discountItem: string;
  //     allocatedDiscount: string; salesNetRevenue: string;

  //     returnQty: string; returnGoodsAmount: string; allocatedReturnDiscount: string; returnNetAmount: string;

  //     netRevenue: string;
  //   }>();

  //   // Tổng hợp cho phần header
  //   const sum = rows.reduce((a, r) => ({
  //     soldQty: a.soldQty + Number(r.soldQty || 0),
  //     goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
  //     allocatedDiscount: a.allocatedDiscount + Number(r.allocatedDiscount || 0),

  //     returnQty: a.returnQty + Number(r.returnQty || 0),
  //     returnGoodsAmount: a.returnGoodsAmount + Number(r.returnGoodsAmount || 0),
  //     allocatedReturnDiscount: a.allocatedReturnDiscount + Number(r.allocatedReturnDiscount || 0),

  //     // Doanh thu (sau KM)
  //     revenue: a.revenue + (Number(r.goodsAmount || 0) - Number(r.allocatedDiscount || 0)),
  //     // Giá trị trả (sau phân bổ)
  //     returnAmount: a.returnAmount + (Number(r.returnGoodsAmount || 0) - Number(r.allocatedReturnDiscount || 0)),
  //     // Doanh thu thuần
  //     netRevenue: a.netRevenue + Number(r.netRevenue || 0),
  //   }), {
  //     soldQty: 0, goodsAmount: 0, allocatedDiscount: 0,
  //     returnQty: 0, returnGoodsAmount: 0, allocatedReturnDiscount: 0,
  //     revenue: 0, returnAmount: 0, netRevenue: 0,
  //   });

  //   // Chuẩn hoá đúng tên cột để FE render như ảnh
  //   const mappedRows = rows.map(r => ({
  //     itemCode: r.itemCode,
  //     itemName: r.itemName,
  //     categoryName: r.categoryName,

  //     slMua: Number(r.soldQty || 0),
  //     doanhThu: Number(r.goodsAmount || 0) - Number(r.allocatedDiscount || 0),

  //     slTra: Number(r.returnQty || 0),
  //     giaTriTra: Number(r.returnGoodsAmount || 0) - Number(r.allocatedReturnDiscount || 0),

  //     doanhThuThuan: Number(r.netRevenue || 0),
  //   }));

  //   return new ResponseCommon(200, true, 'OK', {
  //     printedAt: new Date().toISOString(),
  //     dateRange: { from: from.toISOString(), to: to.toISOString() },
  //     customerFilter: { customerId: q.customerId || null, customerQ: q.customerQ || null },
  //     sum: {
  //       soldQty: sum.soldQty,
  //       revenue: sum.revenue,
  //       returnQty: sum.returnQty,
  //       returnAmount: sum.returnAmount,
  //       netRevenue: sum.netRevenue,
  //       // (thêm các trường debug nếu cần)
  //     },
  //     rows: mappedRows,
  //   }, { total: mappedRows.length, page, limit, pages: Math.ceil(mappedRows.length / limit) });
  // }


  // /* ====== 3) BÁO CÁO LỢI NHUẬN THEO NHÂN VIÊN ====== */
  // async staffProfit(q: StaffReportQueryDto) {
  //   const from = q.dateFrom ? new Date(q.dateFrom) : this.sod();
  //   const to = q.dateTo ? new Date(q.dateTo) : this.eod();

  //   // tiền hàng theo dòng món
  //   const goodsExpr = `oi.quantity * oi.price`;
  //   const recipeCostPerOne = `
  //     COALESCE((
  //       SELECT SUM(ing.quantity * ii."avgCost")
  //       FROM ingredients ing
  //       JOIN inventory_items ii ON ii.id = ing."inventoryItemId"
  //       WHERE ing."menuItemId" = mi.id
  //     ), 0)
  //   `;
  //   // COGS của 1 dòng order_item:
  //   const cogsExpr = `oi.quantity * (${recipeCostPerOne})`;

  //   // ----- Query "nhân viên × hóa đơn" -----
  //   const qb = this.oiRepo.createQueryBuilder('oi')
  //     .innerJoin('oi.order', 'o')
  //     .innerJoin('o.invoice', 'inv')
  //     .leftJoin('o.createdBy', 'creator')
  //     .leftJoin('creator.profile', 'cp')
  //     .leftJoin('inv.cashier', 'cash')
  //     .leftJoin('cash.profile', 'cprof')
  //     .innerJoin('oi.menuItem', 'mi')
  //     .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })

  //     // Nhân viên: ưu tiên người nhận đơn, nếu null thì lấy thu ngân
  //     .select(
  //       `CASE WHEN creator.id IS NOT NULL THEN creator.id ELSE cash.id END`,
  //       'userId'
  //     )
  //     .addSelect('cp.full_name', 'fullName')

  //     .addSelect(`SUM(${goodsExpr})`, 'goodsAmount')          // Tổng tiền hàng
  //     .addSelect(`COALESCE(inv.discountTotal,0)`, 'invoiceDiscount')     // Giảm giá HĐ
  //     .addSelect(`0`, 'returnValue')          // Chưa có trả hàng
  //     .addSelect(`SUM(${cogsExpr})`, 'cogs')                 // Tổng giá vốn
  //     .groupBy('"userId", "fullName", inv.id')
  //     .orderBy('"fullName"', 'ASC');

  //   // Bộ lọc
  //   if (q.receiverId) qb.andWhere('creator.id = :rid OR cash.id = :rid', { rid: q.receiverId });
  //   if (q.tableId) qb.andWhere('o.tableId = :tid', { tid: q.tableId });
  //   if ((q as any).orderType) qb.andWhere('o.orderType = :ot', { ot: (q as any).orderType });

  //   const rows = await qb.getRawMany<{
  //     userId: string; fullName: string;
  //     goodsAmount: string; invoiceDiscount: string; returnValue: string; cogs: string;
  //   }>();
  //   // Gom theo nhân viên (vì discount hóa đơn)
  //   type Agg = {
  //     userId: string; fullName: string;
  //     goodsAmount: number; invoiceDiscount: number;
  //     revenue: number; returnValue: number;
  //     netRevenue: number; cogs: number; grossProfit: number;
  //   };
  //   const map = new Map<string, Agg>();


  //   for (const r of rows) {
  //     const k = r.userId || 'null';
  //     const cur = map.get(k) || {
  //       userId: r.userId, fullName: r.fullName,
  //       goodsAmount: 0, invoiceDiscount: 0,
  //       revenue: 0, returnValue: 0, netRevenue: 0,
  //       cogs: 0, grossProfit: 0,
  //     };
  //     const goods = Number(r.goodsAmount || 0);
  //     const disc = Number(r.invoiceDiscount || 0);
  //     const ret = Number(r.returnValue || 0);
  //     const cogs = Number(r.cogs || 0);

  //     cur.goodsAmount += goods;
  //     cur.invoiceDiscount += disc;
  //     cur.revenue = cur.goodsAmount - cur.invoiceDiscount; // Doanh thu
  //     cur.returnValue += ret;
  //     cur.netRevenue = cur.revenue - cur.returnValue;         // Doanh thu thuần
  //     cur.cogs += cogs;                                   // Giá vốn
  //     cur.grossProfit = cur.netRevenue - cur.cogs;              // Lợi nhuận gộp
  //     map.set(k, cur);
  //   }

  //   const data = [...map.values()];
  //   console.log("data", data);
  //   const header = {
  //     staffCount: data.length,
  //     goodsAmount: data.reduce((a, x) => a + x.goodsAmount, 0),
  //     invoiceDiscount: data.reduce((a, x) => a + x.invoiceDiscount, 0),
  //     revenue: data.reduce((a, x) => a + x.revenue, 0),
  //     returnValue: data.reduce((a, x) => a + x.returnValue, 0),
  //     netRevenue: data.reduce((a, x) => a + x.netRevenue, 0),
  //     cogs: data.reduce((a, x) => a + x.cogs, 0),
  //     grossProfit: data.reduce((a, x) => a + x.grossProfit, 0),
  //   };

  //   return { printedAt: new Date().toISOString(), dateRange: { from, to }, header, rows: data };
  // }

  private applyOrderFilters<T extends import('typeorm').ObjectLiteral>(
    qb: import('typeorm').SelectQueryBuilder<T>,
    q: { createdBy?: string; tableId?: string; orderType?: any; }
  ) {
    if (q.orderType) qb.andWhere('o.orderType = :ot', { ot: q.orderType });
    if (q.tableId) qb.andWhere('o.tableId = :tid', { tid: q.tableId });
    // Không add filter createdBy ở đây để tránh lỗi alias không tồn tại giữa các truy vấn khác nhau.
    // if (!q.includeCancelled) qb.andWhere('COALESCE(o.cancelled,false) = false');
    return qb;
  }

  // ===== Helpers: chuẩn hoá [from, to) theo NGÀY LOCAL VN khi người dùng nhập YYYY-MM-DD =====
  private localStartOfDay(dateInput?: string | Date): Date {
    // Nếu input là 'YYYY-MM-DD' → hiểu là 00:00:00 theo TZ VN; còn lại thì lấy ngày từ input rồi chuẩn hoá về 00:00 TZ VN
    if (typeof dateInput === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        return new Date(`${dateInput}T00:00:00${this.TZ_OFFSET}`);
      }
      // Chuỗi ISO có giờ → lấy ngày theo TZ VN rồi về 00:00 TZ VN
      const ymd = this.fmtYMD(new Date(dateInput));
      return new Date(`${ymd}T00:00:00${this.TZ_OFFSET}`);
    }
    const ymd = this.fmtYMD(dateInput ?? new Date());
    return new Date(`${ymd}T00:00:00${this.TZ_OFFSET}`);
  }

  private plusDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private resolveLocalRange(dateFrom?: string, dateTo?: string): { from: Date; to: Date } {
    let from: Date;
    let to: Date;

    if (dateFrom && dateTo) {
      // Inclusive dateTo: [dateFrom 00:00, (dateTo + 1) 00:00)
      const start = this.localStartOfDay(dateFrom);
      const endInclusive = this.localStartOfDay(dateTo);
      from = start;
      to = this.plusDays(endInclusive, 1);
    } else if (dateFrom) {
      from = this.localStartOfDay(dateFrom);
      to = this.plusDays(from, 1);
    } else if (dateTo) {
      // Only dateTo provided → lấy trọn ngày dateTo
      from = this.localStartOfDay(dateTo);
      to = this.plusDays(from, 1);
    } else {
      // Ngày hôm nay (theo TZ VN): [00:00, 24:00)
      from = this.localStartOfDay();
      to = this.plusDays(from, 1);
    }
    return { from, to };
  }
}
