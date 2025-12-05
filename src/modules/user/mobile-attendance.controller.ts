import { Controller, Post, Body, Req, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { MobileAttendanceService } from './mobile-attendance.service';
import type { Request } from 'express';
import type { CheckPayload } from './mobile-attendance.service';
import { RekogService } from '@modules/face/rekog.service';

class CheckWithFaceDto {
  scheduleId!: string;
  checkType!: 'IN' | 'OUT';

  // ------- NEW: nhiều frame -------
  imagesBase64?: string[]; // payload mới: [frame1, frame2, ...]
  // ------- OLD: single + livenessFrames -------
  imageBase64?: string;    // giữ optional để tương thích cũ
  livenessFrames?: string[];

  lat!: number;
  lng!: number;
  accuracy!: number;
  netType?: 'wifi' | 'cellular' | 'unknown';
  clientTs!: number;

  // nếu muốn sau này dùng challenge cũng được, giờ có thể ignore:
  // challenge?: 'TURN_LEFT' | 'TURN_RIGHT' | 'LOOK_UP';
   ssid?: string;
  bssid?: string;
}


@UseGuards(JwtAuthGuard)
@Controller('mobile/attendance')
export class MobileAttendanceController {
  private readonly logger = new Logger(MobileAttendanceController.name);

  constructor(
    private readonly svc: MobileAttendanceService,
    private readonly rk: RekogService,
  ) {}


   
   @Post('check-with-face')
  async checkWithFace(@Req() req: any, @Body() dto: CheckWithFaceDto) {
    // 0) Bắt buộc đã enroll
    const st = await this.rk.enrollStatus(req.user.id);
    if ((st.count ?? 0) === 0) {
      return { ok: false, verify: 'FAIL_ENROLL' };
    }

    // ===== Gom frames từ payload mới/cũ =====
    const frames: string[] = [];

    if (dto.imagesBase64?.length) {
      frames.push(...dto.imagesBase64);
    } else if (dto.imageBase64) {
      frames.push(dto.imageBase64);
      if (dto.livenessFrames?.length) {
        frames.push(...dto.livenessFrames);
      }
    }

    if (!frames.length) {
      return { ok: false, verify: 'FAIL_NO_IMAGE' };
    }

    // 🔍 LOG PAYLOAD GỌN – KHÔNG BASE64
    this.logger.log({
      tag: 'ATT_CHECK_REQ',
      userId: req.user.id,
      scheduleId: dto.scheduleId,
      checkType: dto.checkType,
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy,
      netType: dto.netType,
      ssid: dto.ssid,
      bssid: dto.bssid,
      clientTs: dto.clientTs,
      frames: frames.length,     // chỉ log số frame
    });

    const mainFrame = frames[0];

    // 1) Verify khuôn mặt bằng frame đầu tiên
    const fv = await this.rk.verify(req.user.id, mainFrame, 82);

    // 🔍 LOG KẾT QUẢ FACE
    this.logger.log({
      tag: 'ATT_FACE_RESULT',
      userId: req.user.id,
      ok: fv.ok,
      reason: fv.reason,
      score: fv.score,
    });

    if (!fv.ok) {
      return {
        ok: false,
        verify: 'FAIL_FACE',
        reason: fv.reason,
        score: fv.score,
      };
    }

    // 2) Liveness “nhẹ”: check pose trên nhiều frame
if (frames.length >= 2) {
  const attrs = await Promise.all(
    frames.map((b64) => this.rk.detectAttrs(b64)),
  );

  const good = attrs.filter((a) => a.ok) as any[];

  if (good.length < 2) {
    return { ok: false, verify: 'FAIL_LIVENESS_NOFACE' };
  }

  const yaw = good.map((g) => g.pose.yaw);
  const pitch = good.map((g) => g.pose.pitch);
  const roll = good.map((g) => g.pose.roll);

  const span = (arr: number[]) =>
    Math.max(...arr) - Math.min(...arr);

  const MIN_SPAN_YAW = 8;
  const MIN_SPAN_PITCH = 6;
  const MIN_SPAN_ROLL = 6;

  const yawSpan = span(yaw);
  const pitchSpan = span(pitch);
  const rollSpan = span(roll);

  // 🔥 LOG DEBUG
  this.logger.warn({
    tag: 'ATT_LIVENESS_POSE_CHECK',
    userId: req.user.id,
    yawSpan,
    pitchSpan,
    rollSpan,
  });

  // ❗ BẬT CHẶN LẠI POSE SAI
  if (
    yawSpan < MIN_SPAN_YAW &&
    pitchSpan < MIN_SPAN_PITCH &&
    rollSpan < MIN_SPAN_ROLL
  ) {
    return {
      ok: false,
      verify: 'FAIL_LIVENESS_POSE',
      yawSpan,
      pitchSpan,
      rollSpan,
    };
  }
}


    // 3) IP thật
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      undefined;

    // 4) Luồng chấm công sẵn có
    return this.svc.check(req.user.id, {
      scheduleId: dto.scheduleId,
      checkType: dto.checkType,
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy,
      netType: dto.netType,
      ssid: dto.ssid,
      bssid: dto.bssid,
      clientTs: dto.clientTs,
      clientIp: ip,
    });
  }


  @Post('check')
  async check(@Req() req: Request, @Body() dto: CheckPayload) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      (req as any).ip ||
      (req.socket && req.socket.remoteAddress) ||
      undefined;

    return this.svc.check((req as any).user.id, { ...dto, clientIp: ip });
  }
}
