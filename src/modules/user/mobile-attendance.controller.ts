// src/modules/user/mobile-attendance.controller.ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { MobileAttendanceService } from './mobile-attendance.service';
import type { Request } from 'express';
import type { CheckPayload } from './mobile-attendance.service'; // hoặc file định nghĩa type
import { RekogService } from '@modules/face/rekog.service';
class CheckWithFaceDto {
  scheduleId!: string;
  checkType!: 'IN' | 'OUT';
  imageBase64!: string;
  lat!: number; lng!: number; accuracy!: number;
  netType?: 'wifi' | 'cellular' | 'unknown'; // <-- đổi ở đây
  clientTs!: number;
    livenessFrames?: string[]; 
}

@UseGuards(JwtAuthGuard)
@Controller('mobile/attendance')
export class MobileAttendanceController {
  constructor(private readonly svc: MobileAttendanceService, private readonly rk: RekogService) {}
   @Post('check-with-face')
  async checkWithFace(@Req() req: any, @Body() dto: CheckWithFaceDto) {
    // 0) Bắt buộc đã enroll
    const st = await this.rk.enrollStatus(req.user.id);
    if ((st.count ?? 0) === 0) return { ok: false, verify: 'FAIL_ENROLL' };

    // 1) Verify khuôn mặt
    const fv = await this.rk.verify(req.user.id, dto.imageBase64, 90);
    if (!fv.ok) return { ok: false, verify: 'FAIL_FACE', top: fv.top };

    // 2) Liveness “nhẹ”: so sánh pose giữa các frame, yêu cầu biến thiên
    if (dto.livenessFrames?.length) {
      const frames = [dto.imageBase64, ...dto.livenessFrames];
      const attrs = await Promise.all(frames.map(b64 => this.rk.detectAttrs(b64)));
      // cần >=2 frame có face
      const good = attrs.filter(a => a.ok);
      if (good.length < 2) return { ok: false, verify: 'FAIL_LIVENESS_NOFACE' };

      // kiểm tra biến thiên pose (yaw/pitch/roll) tối thiểu
      const yaw = good.map(g => g.pose.yaw);
      const pitch = good.map(g => g.pose.pitch);
      const roll = good.map(g => g.pose.roll);
      const span = (arr: number[]) => Math.max(...arr) - Math.min(...arr);

      const MIN_SPAN_YAW = 8;    // tuỳ chỉnh ngưỡng
      const MIN_SPAN_PITCH = 6;
      const MIN_SPAN_ROLL = 6;

      if (span(yaw) < MIN_SPAN_YAW && span(pitch) < MIN_SPAN_PITCH && span(roll) < MIN_SPAN_ROLL) {
        return { ok: false, verify: 'FAIL_LIVENESS_POSE' };
      }
    }

    // 3) IP thật
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip || req.socket?.remoteAddress || undefined;

    // 4) Luồng chấm công sẵn có
    return this.svc.check(req.user.id, {
      scheduleId: dto.scheduleId,
      checkType: dto.checkType,
      lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy,
      netType: dto.netType, clientTs: dto.clientTs, clientIp: ip,
    });
  }
  @Post('check')
  async check(@Req() req: Request, @Body() dto: CheckPayload) {
    // lấy IP thật (ưu tiên x-forwarded-for nếu có proxy)
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      (req as any).ip ||
      (req.socket && req.socket.remoteAddress) ||
      undefined;

    // GỌP ip vào payload rồi gọi service (chỉ 2 tham số)
    return this.svc.check((req as any).user.id, { ...dto, clientIp: ip });
  }
}
