// report.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { OrderStatus, InvoiceStatus } from 'src/common/enums';
import type { RangeKey } from 'src/common/date-range';
import { resolveRange } from 'src/common/date-range';
import { OrderItem } from 'src/modules/orderitems/entities/orderitem.entity';
@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly oiRepo: Repository<OrderItem>,
  ) {}

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
}
