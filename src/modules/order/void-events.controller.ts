// src/modules/order/void-events.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoidEvent } from '../order/entities/void-event.entity';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

import { Between } from 'typeorm';
import { startOfDay, endOfDay } from 'date-fns';
@UseGuards(JwtAuthGuard)
@Controller('void-events')
export class VoidEventsController {
  constructor(
    @InjectRepository(VoidEvent)
    private readonly voidRepo: Repository<VoidEvent>,
  ) {}

  @Get('by-table/:tableId')
  async byTable(
    @Param('tableId') tableId: string,
    @Query('date') date?: string,   // YYYY-MM-DD
  ) {
    const base = date ? new Date(date) : new Date();
    const from = startOfDay(base);
    const to = endOfDay(base);

    const rows = await this.voidRepo.find({
  where: {
    table: { id: tableId },
    createdAt: Between(from, to),
  },
  relations: [
    'order',
    'order.table',
    'menuItem',          // ➕ thêm để chắc có tên món
    'createdBy',
    'createdBy.profile',
  ],
  order: { createdAt: 'DESC' },
});

return rows.map((r) => {
  const u = r.createdBy as any;
  const byName =
    u?.profile?.fullName ||
    u?.username ||
    (u?.email ? String(u.email).split('@')[0] : null) ||
    u?.phoneNumber ||
    null;

  return {
    id: r.id,
    tableName: r.order?.table?.name ?? '',
    itemName: r.menuItem?.name ?? '',
    qty: r.qty,
    createdAt: r.createdAt,
    source: r.source,
    reason: r.reason ?? null,
    byName,     // 👈 FE dùng field này
  };
});

  }
}
