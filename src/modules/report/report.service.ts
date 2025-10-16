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
  /* ====== BÁN HÀNG ====== */
  async salesDaily(q: SalesDailyQueryDto) {
    const from = q.dateFrom ? new Date(q.dateFrom) : this.sod();
    const to = q.dateTo ? new Date(q.dateTo) : this.eod();

    // === Đặt hàng (chưa hóa đơn) ===
    const orderQb = this.orderRepo.createQueryBuilder('o')
      .select(`
        'ORDER' as "docType",
        o.code as "docCode",
        COALESCE(a.name || ' / ' || t.name, t.name, a.name) as "place",
        ur.full_name as "receiverName",
        to_char(o.createdAt,'HH24:MI') as "time",
        NULL as "payMethod",
        SUM(oi.quantity) as "itemsCount",
        SUM(oi.quantity * oi.price) as "goodsAmount",
        COALESCE(SUM(oi.discount),0) as "invoiceDiscount",
        (SUM(oi.quantity * oi.price) - COALESCE(SUM(oi.discount),0)) as "revenue",
        0 as "otherIncome", 0 as "tax", 0 as "returnFee", 0 as "paid", 0 as "debt"
      `)
      .leftJoin('o.items', 'oi')
      .leftJoin('o.table', 't')
      .leftJoin('o.area', 'a')
      .leftJoin('o.receiver', 'ur')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('o.status IN (:...st)', { st: [OrderStatus.PENDING, OrderStatus.CONFIRMED] })
      .groupBy('o.id, t.name, a.name, ur.full_name')
      .orderBy('o.createdAt', 'ASC');
    this.applyOrderFilters(orderQb, q);
    const orders = await orderQb.getRawMany();

    // === Hóa đơn (đã xuất) ===
    const invQb = this.invRepo.createQueryBuilder('inv')
      .select(`
        'INVOICE' as "docType",
        inv.code as "docCode",
        COALESCE(a.name || ' / ' || t.name, t.name, a.name) as "place",
        ur.full_name as "receiverName",
        to_char(inv.createdAt,'HH24:MI') as "time",
        STRING_AGG(DISTINCT pay.method, ',') as "payMethod",
        SUM(oi.quantity) as "itemsCount",
        SUM(oi.quantity * oi.price) as "goodsAmount",
        COALESCE(inv.discountAmount,0) as "invoiceDiscount",
        (SUM(oi.quantity * oi.price) - COALESCE(inv.discountAmount,0)) as "revenue",
        COALESCE(inv.surcharge,0) as "otherIncome",
        COALESCE(inv.taxAmount,0) as "tax",
        COALESCE(inv.returnFee,0) as "returnFee",
        COALESCE(SUM(pay.amount),0) as "paid",
        GREATEST(inv.totalAmount - COALESCE(SUM(pay.amount),0), 0) as "debt"
      `)
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .leftJoin('inv.payments', 'pay')
      .leftJoin('o.table', 't')
      .leftJoin('o.area', 'a')
      .leftJoin('o.receiver', 'ur')
      .where('inv.createdAt >= :from AND inv.createdAt < :to', { from, to })
      .groupBy('inv.id, t.name, a.name, ur.full_name')
      .orderBy('inv.createdAt', 'ASC');

    if (q.paymentMethod) invQb.andWhere('pay.method = :pm', { pm: q.paymentMethod });
    this.applyOrderFilters(invQb, q);
    const invoices = await invQb.getRawMany();

    return {
      printedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      groups: [this.groupify('Đặt hàng', orders), this.groupify('Hóa đơn', invoices)],
    };
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

  /* ====== 2) HÀNG BÁN THEO NHÂN VIÊN ====== */
  async staffSalesItems(q: StaffReportQueryDto) {
    const from = q.dateFrom ? new Date(q.dateFrom) : this.sod();
    const to = q.dateTo ? new Date(q.dateTo) : this.eod();

    // ====== Common expressions ======
    const amt = `oi.quantity * oi.price`;

    // Tổng tiền hàng của HÓA ĐƠN hiện tại (không dùng window)
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

    // ====== KHÔNG dùng alias trong GROUP BY: trích xuất biểu thức ra biến và tái sử dụng ======
    // các biến đã có ở trên
    const exprUserId = `
      CASE WHEN creator.id IS NOT NULL THEN creator.id ELSE cash.id END
      `;
    const exprFullName = `
      CASE
        WHEN cp.full_name    IS NOT NULL THEN cp.full_name
        WHEN cprof.full_name IS NOT NULL THEN cprof.full_name
        WHEN creator.email   IS NOT NULL THEN creator.email
        ELSE cash.email
      END
      `;

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

      // select alias vẫn bình thường
      .select(exprUserId, 'userId')
      .addSelect(exprFullName, 'fullName')
      .addSelect('mi.id', 'itemCode')
      .addSelect('mi.name', 'itemName')
      .addSelect(`SUM(oi.quantity)`, 'soldQty')
      .addSelect(`SUM(${amt})`, 'goodsAmount')
      .addSelect(`SUM(${allocated})`, 'allocatedDiscount')
      .addSelect(`SUM(${amt}) - SUM(${allocated})`, 'netRevenue')

      // ✅ GROUP BY dùng lại biểu thức
      .groupBy(exprUserId)
      .addGroupBy(exprFullName)
      .addGroupBy('mi.id')
      .addGroupBy('mi.name')

      // ✅ ORDER BY cũng dùng lại biểu thức (không dùng alias 'fullName')
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
}
