// src/modules/user/work-schedule.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { WorkSchedule } from './entities/work-schedule.entity';
import { User } from './entities/user.entity';
import { Shift } from './entities/shift.entity';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { randomUUID } from 'node:crypto';
import { Attendance } from './entities/attendance';
function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class WorkScheduleService {
  constructor(
    @InjectRepository(WorkSchedule) private readonly repo: Repository<WorkSchedule>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
     @InjectRepository(Attendance) private readonly attRepo: Repository<Attendance>,
  ) { }
  /** Lấy các ca của 1 user trong 1 ngày (YYYY-MM-DD) */
   /** Lấy các ca của 1 user trong 1 ngày (YYYY-MM-DD) */
  async listByDate(userId: string, date?: string) {
    function ymdLocal(now = new Date()) {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const d = date ?? ymdLocal();

    // 1) Lấy WorkSchedule + shift trong ngày đó
    const rows = await this.repo.find({
      where: { user: { id: userId }, date: d },
      relations: { shift: true },
      order: { date: 'ASC' },
    });

    if (!rows.length) return [];

    // 2) Lấy Attendance tương ứng theo (userId, dateISO=d, shiftId)
    const shiftIds = Array.from(new Set(rows.map(r => (r.shift as any).id)));

    const atts = await this.attRepo.find({
      where: {
        userId,
        dateISO: d,
        shiftId: In(shiftIds),
      },
    });

    const attKey = (shiftId: string | number) => String(shiftId);
    const attMap = new Map(
      atts.map(a => [attKey(a.shiftId), a]),
    );

    // 3) Chuẩn hoá về DTO gọn cho mobile + kèm trạng thái chấm công
    return rows.map(r => {
      const s = r.shift as any;
      const a = attMap.get(attKey(s.id));

      return {
        scheduleId: r.id,           // id của lịch (quan trọng để chấm công)
        shiftId: s.id,
        name: s.name,               // ví dụ: "Ca sáng"
        date: r.date,               // "YYYY-MM-DD"
        start: s.startTime,         // "HH:mm"
        end: s.endTime,             // "HH:mm"
        note: r.note ?? undefined,

        // 🔥 thêm 3 field cho FE
        attCheckIn: a?.checkIn ?? null,
        attCheckOut: a?.checkOut ?? null,
        attStatus: a?.status ?? null, // AttendanceStatus enum → FE nhận string
      };
    });
  }

  /** kiểm tra chồng lấn trong cùng ngày của 1 user */
  private async validateOverlap(userId: string, date: string, shift: Shift, ignoreId?: string) {
    const sameDay = await this.repo.find({
      where: { user: { id: userId }, date },
      relations: { shift: true },
    });
    const start = toMinutes(shift.startTime);
    const end = toMinutes(shift.endTime);

    const clash = sameDay.some(s => {
      if (ignoreId && s.id === ignoreId) return false;
      const a = toMinutes(s.shift.startTime), b = toMinutes(s.shift.endTime);
      return Math.max(a, start) < Math.min(b, end); // giao nhau
    });
    if (clash) throw new ResponseException(null, 400, 'SHIFT_TIME_OVERLAP');
  }

  async create(dto: CreateScheduleDto) {
    const userIds = dto.applyToUserIds?.length ? dto.applyToUserIds : [dto.userId];
    const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId } });
    if (!shift) throw new ResponseException(null, 404, 'SHIFT_NOT_FOUND');
    const users = await this.userRepo.find({ where: { id: In(userIds), isDelete: false } });
    if (users.length !== userIds.length) throw new ResponseException(null, 404, 'SOME_USERS_NOT_FOUND');

    const items: WorkSchedule[] = [];
    const groupId = dto.repeatWeekly ? randomUUID() : null;

    const dates: string[] = [];
    if (dto.repeatWeekly && dto.repeatUntil) {
      const start = new Date(dto.date);
      const end = new Date(dto.repeatUntil);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        dates.push(d.toISOString().slice(0, 10));
      }
    } else {
      dates.push(dto.date);
    }

    for (const u of users) {
      for (const date of dates) {
        await this.validateOverlap(u.id, date, shift);
        const row = this.repo.create({ user: u, shift, date, note: dto.note, repeatGroupId: groupId });
        items.push(row);
      }
    }

    await this.repo.save(items);
    return { success: true, count: items.length };
  }

  async listByWeek(start: string, end: string, userIds?: string[]) {
    const where: any = { date: Between(start, end) };
    if (userIds?.length) where.user = { id: In(userIds) };
    const rows = await this.repo.find({
      where,
      relations: { user: true, shift: true },
      order: { date: 'ASC' },
    });
    return rows;
  }

  async update(id: string, dto: UpdateScheduleDto) {
    const item = await this.repo.findOne({ where: { id }, relations: { shift: true, user: true } });
    if (!item) throw new ResponseException(null, 404, 'SCHEDULE_NOT_FOUND');

    if (dto.shiftId || dto.date) {
      const newShift = dto.shiftId ? await this.shiftRepo.findOne({ where: { id: dto.shiftId } }) : item.shift;
      if (!newShift) throw new ResponseException(null, 404, 'SHIFT_NOT_FOUND');
      const newDate = dto.date ?? item.date;

      await this.validateOverlap(item.user.id, newDate, newShift, item.id);
      item.shift = newShift;
      item.date = newDate;
    }

    if (dto.note !== undefined) item.note = dto.note;

    return this.repo.save(item);
  }

  async remove(id: string) {
    await this.repo.delete(id);
    return { success: true };
  }

  /** xoá cả chuỗi lặp (tuỳ chọn) */
  async removeRepeatGroup(repeatGroupId: string) {
    await this.repo.delete({ repeatGroupId });
    return { success: true };
  }
}
