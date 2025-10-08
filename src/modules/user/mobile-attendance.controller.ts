// src/modules/user/mobile-attendance.controller.ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { MobileAttendanceService } from './mobile-attendance.service';
import type { Request } from 'express';
import type { CheckPayload } from './mobile-attendance.service'; // hoặc file định nghĩa type

@UseGuards(JwtAuthGuard)
@Controller('mobile/attendance')
export class MobileAttendanceController {
  constructor(private readonly svc: MobileAttendanceService) {}

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
