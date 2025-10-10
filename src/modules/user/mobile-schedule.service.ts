// src/modules/user/controllers/mobile-schedule.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { WorkSchedule } from './entities/work-schedule.entity';
import { Attendance } from './entities/attendance';

type MobileScheduleDTO = {
  id: string;            // workSchedule.id
  date: string;          // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  start: string;         // HH:mm
  end: string;           // HH:mm
  status: 'planned' | 'in' | 'out';
  attendanceId?: string | null;
};

@Injectable()
export class MobileScheduleService {
  constructor(
    @InjectRepository(WorkSchedule) private readonly wsRepo: Repository<WorkSchedule>,
    @InjectRepository(Attendance)   private readonly attRepo: Repository<Attendance>,
  ) {}

  async listForUser(userId: string, from: string, to: string): Promise<MobileScheduleDTO[]> {
    // Lấy lịch trong khoảng ngày
    const rows = await this.wsRepo.find({
      where: { user: { id: userId } as any, date: Between(from, to) },
      relations: ['shift'],
      order: { date: 'ASC' },
    });

    if (!rows.length) return [];

    // Lấy Attendance tương ứng theo (dateISO, shiftId)
    const dates = Array.from(new Set(rows.map(r => r.date)));
    const shiftIds = Array.from(new Set(rows.map(r => (r.shift as any).id)));

    const atts = await this.attRepo.find({
      where: {
        userId,
        dateISO: In(dates),
        shiftId: In(shiftIds),
      },
    });

    const key = (d: string, s: string) => `${d}__${s}`;
    const attMap = new Map(atts.map(a => [key(a.dateISO, a.shiftId), a]));

    // Map ra DTO cho mobile
    return rows.map(r => {
      const s = r.shift as any;
      const a = attMap.get(key(r.date, s.id));
      const status: 'planned' | 'in' | 'out' =
        a?.checkOut ? 'out' : a?.checkIn ? 'in' : 'planned';
      return {
        id: r.id,
        date: r.date,
        shiftId: s.id,
        shiftName: s.name,
        start: s.startTime,   // HH:mm
        end:   s.endTime,     // HH:mm
        status,
        attendanceId: a?.id ?? null,
      };
    });
  }
}
