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

  /** KPI tổng quan */
  async summary(range: RangeKey) {
    const { start, end } = resolveRange(range);
    const TZ = this.TZ; // 'Asia/Ho_Chi_Minh'

    // ---------- Doanh thu ----------
    const revRow = await this.invRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(CAST(inv.total_amount AS numeric)), 0)', 'revenue')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, { tz: TZ, start, end })
      .getRawOne<{ revenue: string }>();
    const revenue = Number(revRow?.revenue ?? 0);



    // Đơn đã xong (PAID trong range)
    const doneRow = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(1)', 'c')
      .where('o.status = :st', { st: OrderStatus.PAID })
      .andWhere(`"o"."updatedAt" AT TIME ZONE :tz BETWEEN :start AND :end`, {  // 👈 sửa ở đây
        tz: this.TZ, start, end
      })
      .getRawOne<{ c: string }>();
    const ordersDone = Number(doneRow?.c ?? 0);

    // Đang phục vụ (PENDING/CONFIRMED trong range)
    const inServiceRow = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(1)', 'c')
      .where('o.status IN (:...sts)', { sts: [OrderStatus.PENDING, OrderStatus.CONFIRMED] })
      .andWhere(`"o"."updatedAt" AT TIME ZONE :tz BETWEEN :start AND :end`, {  // 👈 và ở đây
        tz: this.TZ, start, end
      })
      .getRawOne<{ c: string }>();
    const inService = Number(inServiceRow?.c ?? 0);

    // ---------- Khách (distinct customer_id của invoice PAID trong range) ----------
    const cusRow = await this.invRepo
      .createQueryBuilder('inv')
      .select('COUNT(DISTINCT inv.customer_id)', 'customers')
      .where('inv.status = :st', { st: InvoiceStatus.PAID })
      .andWhere('inv.customer_id IS NOT NULL')
      .andWhere(`inv.updated_at AT TIME ZONE :tz BETWEEN :start AND :end`, { tz: TZ, start, end })
      .getRawOne<{ customers: string }>();
    const customers = Number(cusRow?.customers ?? 0);

    return { revenue, ordersDone, inService, customers };
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
      const limit = Math.min(200, Math.max(1, Number((q as any).limit) || 20));

      // Total count (distinct invoices) with same filters
      const countQb = this.invRepo.createQueryBuilder('inv')
        .innerJoin('inv.order', 'o')
        .leftJoin('o.table', 't')
        .leftJoin('t.area', 'a')
        .leftJoin('o.createdBy', 'ur')
        .leftJoin('ur.profile', 'pf')
        .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
        .select('COUNT(DISTINCT inv.id)', 'total');
      if (q.paymentMethod) {
        countQb.leftJoin('inv.payments', 'pay').andWhere('pay.method = :pm', { pm: q.paymentMethod });
      }
      if (q.areaId) {
        countQb.andWhere('a.id = :aid', { aid: q.areaId });
      }
      this.applyOrderFilters(countQb as any, q);
      const countRow = await countQb.getRawOne<{ total: string }>();
      const total = Number(countRow?.total || 0);

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

      const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };
      const data = {
        printedAt: new Date().toISOString(),
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        groups: [
          this.groupify('Hóa đơn', invoices),
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
      const limit = Math.min(200, Math.max(1, Number((q as any).limit) || 10));

      // Total
      const countQb = this.ds.createQueryBuilder()
        .from('cashbook_entries', 'cb')
        .leftJoin('invoices', 'inv', 'inv.id = cb.invoice_id')
        .leftJoin('purchase_receipts', 'prc', 'prc.id = cb.purchase_receipt_id')
        .leftJoin('orders', 'o', 'o.id = inv.order_id')
        .leftJoin('tables', 't', 't.id = o."tableId"')
        .leftJoin('areas', 'ar', 'ar.id = t.area_id')
        .leftJoin('customers', 'cus', 'cus.id = cb.customer_id')
        .leftJoin('payments', 'pay', 'pay."invoiceId" = inv.id')
        .where('cb.date >= :from AND cb.date < :to', { from, to })
        .select('COUNT(1)', 'total');
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
        .leftJoin('payments', 'pay', 'pay."invoiceId" = inv.id')
        .leftJoin('users', 'ucr', 'ucr.id = inv.cashier_id')
        .leftJoin('profiles', 'pcr', 'pcr.user_id = ucr.id')
        .leftJoin('users', 'ur', 'ur.id = o."createdById"')
        .leftJoin('profiles', 'pr', 'pr.user_id = ur.id')
        .leftJoin('users', 'ucrp', 'ucrp.id = prc.created_by_id')
        .leftJoin('profiles', 'pcrp', 'pcrp.user_id = ucrp.id')
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
        .where('cb.date >= :from AND cb.date < :to', { from, to })
        .orderBy('cb.date', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit)
        .setParameters({ tz: this.TZ });

      const rows = await qb.getRawMany<{
        code: string; time: string; occurredAt: string; receipt: string; payment: string; cashType: string; counterparty: string; tableName: string; areaName: string; paymentMethods: string; creatorId: string | null; creatorName: string | null; receiverId: string | null; receiverName: string | null;
      }>();

      const sum = rows.reduce((a, r) => ({
        receipt: a.receipt + Number(r.receipt || 0),
        payment: a.payment + Number(r.payment || 0),
      }), { receipt: 0, payment: 0 });

      const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) };
      const data = {
        printedAt: new Date().toISOString(),
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        groups: [{
          title: `Thu chi: ${rows.length}`, totalCount: rows.length, sum, rows: rows.map(r => ({
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
      const limit = Math.min(200, Math.max(1, Number((q as any).limit) || 10));

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
    const from = q.dateFrom ? new Date(q.dateFrom) : this.sod();
    const to = q.dateTo ? new Date(q.dateTo) : this.eod();

    // Gộp theo nhân viên (createdBy) trên HOÁ ĐƠN đã lập trong khoảng thời gian
    const qb = this.invRepo.createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .leftJoin('o.createdBy', 'ur')
      .innerJoin('o.items', 'oi')           // Order.items -> OrderItem
      .leftJoin('ur.profile', 'pf')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .select('ur.id', 'userId')
      .addSelect('pf.fullName', 'fullName')
      // Tổng tiền hàng theo món
      .addSelect('SUM(oi.quantity * oi.price)', 'amountGoods')
      // Giảm giá cấp hóa đơn (đã tính sẵn trên invoice)
      .addSelect('COALESCE(inv.discountTotal, 0)', 'discountTotal')
      // Doanh thu thuần = amountGoods - discountTotal
      .groupBy('ur.id, pf.fullName, ur.username, ur.email, inv.id');

    this.applyOrderFilters(qb, q);

    const rows = await qb.getRawMany<{
      userId: string; fullName: string; amountGoods: string; discountTotal: string;
    }>();

    // Gộp lại theo nhân viên (vì discountTotal là theo từng inv)
    const map = new Map<string, { userId: string; fullName: string; revenue: number; returnValue: number; netRevenue: number }>();
    for (const r of rows) {
      const key = r.userId || 'null';
      const cur = map.get(key) || { userId: r.userId, fullName: r.fullName, revenue: 0, returnValue: 0, netRevenue: 0 };
      const goods = Number(r.amountGoods || 0);
      const disc = Number(r.discountTotal || 0);
      const net = goods - disc;
      cur.revenue += net;      // doanh thu sau giảm HĐ
      cur.returnValue += 0;        // chưa có bảng trả hàng → 0
      cur.netRevenue = cur.revenue - cur.returnValue;
      map.set(key, cur);
    }

    const data = [...map.values()];
    const header = {
      staffCount: data.length,
      revenue: data.reduce((a, x) => a + x.revenue, 0),
      returnValue: 0,
      netRevenue: data.reduce((a, x) => a + x.netRevenue, 0),
    };

    return { printedAt: new Date().toISOString(), dateRange: { from, to }, header, rows: data };
  }

  /* ====== 2) BÁO CÁO HÀNG BÁN THEO NHÂN VIÊN ====== */
  async staffSalesItems(q: StaffReportQueryDto) {
    const from = q.dateFrom ? new Date(q.dateFrom) : this.sod();
    const to = q.dateTo ? new Date(q.dateTo) : this.eod();
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
    const exprUserId = `
      CASE WHEN creator.id IS NOT NULL THEN creator.id ELSE cash.id END
      `;
    const exprFullName = `cp.full_name`;

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
      .orderBy(exprFullName, 'ASC')
      .addOrderBy('mi.name', 'ASC');


    if (q.receiverId) qb.andWhere('creator.id = :rid OR cash.id = :rid', { rid: q.receiverId });
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
    q: { receiverId?: string; tableId?: string; orderType?: any; }
  ) {
    if (q.orderType) qb.andWhere('o.orderType = :ot', { ot: q.orderType });
    if (q.tableId) qb.andWhere('o.tableId = :tid', { tid: q.tableId });
    if (q.receiverId) qb.andWhere('ur.id = :rid', { rid: q.receiverId });
    // if (!q.includeCancelled) qb.andWhere('COALESCE(o.cancelled,false) = false');
    return qb;
  }


  private groupify(title: string, rows: any[]) {
    const sum = rows.reduce((a, r: any) => ({
      goodsAmount: a.goodsAmount + Number(r.goodsAmount || 0),
      invoiceDiscount: a.invoiceDiscount + Number(r.invoiceDiscount || 0),
      revenue: a.revenue + Number(r.revenue || 0),
      otherIncome: a.otherIncome + Number(r.otherIncome || 0),
      tax: a.tax + Number(r.tax || 0),
      returnFee: a.returnFee + Number(r.returnFee || 0),
      paid: a.paid + Number(r.paid || 0),
      debt: a.debt + Number(r.debt || 0),
    }), { goodsAmount: 0, invoiceDiscount: 0, revenue: 0, otherIncome: 0, tax: 0, returnFee: 0, paid: 0, debt: 0 });
    return { title: `${title}: ${rows.length}`, totalCount: rows.length, sum, rows };
  }

  private sod() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  private eod() { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }

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
