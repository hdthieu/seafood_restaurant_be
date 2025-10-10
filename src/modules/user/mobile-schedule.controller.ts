// src/modules/user/controllers/mobile-schedule.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { MobileScheduleService } from './mobile-schedule.service';

@Controller('mobile/schedules')
@UseGuards(JwtAuthGuard)
export class MobileScheduleController {
  constructor(private readonly svc: MobileScheduleService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string, @Req() req?: any) {
    const F = from ?? new Date().toISOString().slice(0, 10);
    const T = to   ?? F;
    return this.svc.listForUser(req.user.id, F, T);
  }
}
