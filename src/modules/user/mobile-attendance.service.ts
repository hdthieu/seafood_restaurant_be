// src/modules/user/services/mobile-attendance.service.ts
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkSchedule } from './entities/work-schedule.entity';
import { Attendance } from './entities/attendance';
import { AttendanceMethod, AttendanceStatus } from '../../common/enums';
import { RulesService } from './services/rules.service';

export type CheckPayload = {
  scheduleId: string;
  checkType: 'IN' | 'OUT';
  lat?: number; lng?: number; accuracy?: number;
  netType?: 'wifi' | 'cellular' | 'unknown'; clientTs?: number;
  ssid?: string; bssid?: string; clientIp?: string;
};

@Injectable()
export class MobileAttendanceService {
  constructor(
    @InjectRepository(WorkSchedule) private readonly wsRepo: Repository<WorkSchedule>,
    @InjectRepository(Attendance)  private readonly attRepo: Repository<Attendance>,
    private readonly rulesSvc: RulesService,
  ) {}

  private toHHmm(d: Date) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  private hmToNum(hm: string) { const [h,m] = hm.split(':').map(Number); return h*100+m; }

  private inWindow(dateISO: string, startHHmm: string, endHHmm: string, now: Date) {
    const toDate = (d: string, hm: string) => new Date(`${d}T${hm}:00`);
    const start = new Date(toDate(dateISO, startHHmm).getTime() - 15 * 60_000);
    const end   = new Date(toDate(dateISO, endHHmm).getTime() + 15 * 60_000);
    return now >= start && now <= end;
  }

  /** Haversine (m) */
  private haversineMeter(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  async check(userId: string, dto: CheckPayload) {
    // 1) Lấy WorkSchedule & validate owner
    const ws = await this.wsRepo.findOne({
      where: { id: dto.scheduleId },
      relations: ['shift', 'user'],
    });
    if (!ws || (ws.user as any).id !== userId) {
      throw new ForbiddenException('SCHEDULE_NOT_FOUND');
    }

    const now = new Date();
    const shift = ws.shift as any; // { id, name, startTime:'HH:mm', endTime:'HH:mm' }

    // 2) Kiểm tra trong cửa sổ cho phép (±15’)
    if (!this.inWindow(ws.date, shift.startTime, shift.endTime, now)) {
      throw new BadRequestException('OUT_OF_SHIFT_WINDOW');
    }

    // 3) Verify GEO/NET
    const { geo, net } = await this.rulesSvc.getRules(); // tạm không phân branch

    // GPS
    let gpsOk = true;
    if (geo.length) {
      if (dto.lat == null || dto.lng == null) gpsOk = false;
      else {
        gpsOk = geo.some(g => {
          const d = this.haversineMeter(g.centerLat, g.centerLng, dto.lat!, dto.lng!);
          const r = (g.radiusMeter ?? 0) as number;
          return d <= r;
        });
      }
    }

    // Wi-Fi / IP (tuỳ bạn triển khai; mặc định pass nếu chưa cấu hình rule)
    let wifiOk = true;
    if (net.length) {
      // ví dụ: nếu có CIDR rule -> sẽ so IP (clientIp) với CIDR (chưa cài ở đây)
      // Có thể bổ sung ipInCidrs(dto.clientIp, net.map(n => n.cidr).filter(Boolean))
      wifiOk = true;
    }

      if (!gpsOk) return { ok: false, verify: 'FAIL_GPS',  serverTime: now.toISOString() };
  if (!wifiOk) return { ok: false, verify: 'FAIL_WIFI', serverTime: now.toISOString() };

    // 4) Upsert Attendance theo (userId, dateISO, shiftId)
    const dateISO = ws.date;
    const shiftId = (ws.shift as any).id;

    let att = await this.attRepo.findOne({ where: { userId, dateISO, shiftId } });
    if (!att) {
      att = this.attRepo.create({
        userId, dateISO, shiftId,
        status: AttendanceStatus.MISSING,
        method: AttendanceMethod.SELF,
      } as Attendance);
    } else {
      att.method = AttendanceMethod.SELF;
    }

    const hhmm = this.toHHmm(now);

    if (dto.checkType === 'IN') {
      if (att.checkIn) throw new BadRequestException('ALREADY_CHECKED_IN');
      att.checkIn = hhmm;
      att.status = AttendanceStatus.MISSING; // chưa đủ OUT
    } else {
      if (!att.checkIn) throw new BadRequestException('NOT_CHECKED_IN');
      if (att.checkOut) throw new BadRequestException('ALREADY_CHECKED_OUT');
      att.checkOut = hhmm;

      // Đánh giá ON_TIME / LATE
      const grace = 0; // phút nới (nếu muốn), để 0 = chặt
      const toNum = (t: string) => this.hmToNum(t);
      const startN = toNum(shift.startTime) + grace;
      const endN   = toNum(shift.endTime)   - grace;
      const inN    = toNum(att.checkIn);
      const outN   = toNum(att.checkOut);

      const lateIn   = inN  > startN;
      const earlyOut = outN < endN;
      att.status = (lateIn || earlyOut) ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME;
    }

    // Dấu vết mobile
    att.lat      = dto.lat ?? null;
    att.lng      = dto.lng ?? null;
    att.accuracy = dto.accuracy ?? null;
    att.clientTs = dto.clientTs ?? null;
    att.netType = dto.netType;
    att.ssid     = dto.ssid ?? null;
    att.bssid    = dto.bssid ?? null;
    att.clientIp = dto.clientIp ?? null;

    await this.attRepo.save(att);
    return { ok: true, verify: 'PASS' as const, serverTime: now.toISOString() };
  }
}
