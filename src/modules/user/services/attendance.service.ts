import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from '../entities/attendance';
import { WorkSchedule } from '../entities/work-schedule.entity';
import { Shift } from '../entities/shift.entity';
import { AttendanceStatus, AttendanceMethod } from '../../../common/enums';
import { getCheckWindows, within } from '../shift-time.util';
import { Between, In } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly repo: Repository<Attendance>,
    @InjectRepository(WorkSchedule) private readonly wsRepo: Repository<WorkSchedule>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
  ) {}

  /** Admin tạo/sửa (thủ công). strict=false: cảnh báo ngoài khung nhưng vẫn cho lưu. */
  async upsertManual(dto: {
    userId: string;
    dateISO: string;        // '2025-10-06'
    shiftId: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status?: AttendanceStatus;   // ABSENT/LEAVE/...
    note?: string | null;
    adminId: string;
    strict?: boolean;       // true => ngoài khung -> throw
  }) {
    // Bắt buộc ca đã được phân lịch
    const ws = await this.wsRepo.findOne({
      where: { user: { id: dto.userId }, date: dto.dateISO, shift: { id: dto.shiftId } },
    });
    if (!ws) throw new BadRequestException('SHIFT_NOT_ASSIGNED');

    const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId } });
    if (!shift) throw new BadRequestException('SHIFT_NOT_FOUND');

    // Kiểm tra khung
    const win = getCheckWindows(shift);
    if (dto.strict) {
      if (dto.checkIn && !within(dto.checkIn, win.in))  throw new BadRequestException('CHECKIN_OUTSIDE_WINDOW');
      if (dto.checkOut && !within(dto.checkOut, win.out)) throw new BadRequestException('CHECKOUT_OUTSIDE_WINDOW');
    }

    // Lấy/khởi tạo
    let a = await this.repo.findOne({ where: { userId: dto.userId, dateISO: dto.dateISO, shiftId: dto.shiftId } });
    if (!a) {
      a = this.repo.create({
        userId: dto.userId,
        dateISO: dto.dateISO,
        shiftId: dto.shiftId,
        method: AttendanceMethod.MANUAL,
        createdBy: dto.adminId,
      });
    }

    // Gán giờ
    a.checkIn  = dto.checkIn  ?? null;
    a.checkOut = dto.checkOut ?? null;
    a.note = dto.note ?? null;

    // Trạng thái
    if (dto.status === AttendanceStatus.LEAVE || dto.status === AttendanceStatus.ABSENT) {
      a.status = dto.status;
    } else {
      a.status = this.computeStatus(shift.startTime, shift.endTime, a.checkIn, a.checkOut);
    }

    return this.repo.save(a);
  }

  /** Tính trạng thái cơ bản */
  computeStatus(shiftStart: string, shiftEnd: string, inTime?: string | null, outTime?: string | null): AttendanceStatus {
    if (!inTime && !outTime) return AttendanceStatus.MISSING;
    if (!inTime || !outTime)  return AttendanceStatus.MISSING;

    const lateIn  = inTime  > shiftStart;
    const earlyOut= outTime < shiftEnd;

    if (!lateIn && !earlyOut) return AttendanceStatus.ON_TIME;
    return AttendanceStatus.LATE;
  }

  /** Lấy chấm công trong khoảng ngày (cho UI bảng) */
  async findRange(fromISO: string, toISO: string, userId?: string) {
  // 1) lấy thô từ attendances
  const where: any = { dateISO: Between(fromISO, toISO) };
  if (userId) where.userId = userId;

  const rows = await this.repo.find({
    where,
    order: { dateISO: 'ASC' },
    // KHÔNG join ở đây để tránh lỗi 500 do mapping
  });

  if (rows.length === 0) return [];

  // 2) gom id để map tên
  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const shiftIds = Array.from(new Set(rows.map(r => r.shiftId)));

  const [users, shifts] = await Promise.all([
    this.repo.manager.getRepository(User).find({ where: { id: In(userIds) } }),
    this.repo.manager.getRepository(Shift).find({ where: { id: In(shiftIds) } }),
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  const shiftMap = new Map(shifts.map(s => [s.id, s]));

  // 3) ghép dữ liệu trả cho FE
  return rows.map(r => {
    const u = userMap.get(r.userId);
    const s = shiftMap.get(r.shiftId);
    return {
      id: r.id,
      userId: r.userId,
      userName:u?.username || u?.email || '',
      dateISO: r.dateISO,
      shiftId: r.shiftId,
      shiftName: s?.name || '',
      startTime: s?.startTime || '',
      endTime: s?.endTime || '',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      method: r.method,
      note: r.note,
    };
  });
}

  /** Một user – nguyên tuần (giữ lại nếu bạn cần) */
  findWeek(userId: string, fromISO: string, toISO: string) {
    return this.repo.createQueryBuilder('a')
      .where('a.userId = :userId', { userId })
      .andWhere('a.dateISO BETWEEN :from AND :to', { from: fromISO, to: toISO })
      .orderBy('a.dateISO','ASC')
      .getMany();
  }
}
