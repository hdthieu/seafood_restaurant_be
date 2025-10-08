import { Controller, Post, Body, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './services/attendance.service';
import { AttendanceStatus } from '../../common/enums';

@ApiTags('/attendance')
@Controller('admin/attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post('upsert')
  async upsert(
    @Body() body: {
      userId: string;
      dateISO: string;
      shiftId: string;
      checkIn?: string | null;
      checkOut?: string | null;
      status?: AttendanceStatus;
      note?: string | null;
      strict?: boolean;
    },
    @Req() req: any,
  ) {
    
    const adminId = req?.user?.id ?? '00000000-0000-0000-0000-000000000001';
    return this.svc.upsertManual({ ...body, adminId });
  }

  /** Cho UI: lấy bảng chấm công theo khoảng ngày */
  @Get('range')
  async listRange(
    @Query('from') fromISO: string,
    @Query('to') toISO: string,
    @Query('userId') userId?: string,
  ) {
    return this.svc.findRange(fromISO, toISO, userId);
  }

  // Tuỳ giữ hoặc bỏ – dùng nếu muốn xem 1 user theo tuần
  @Get('week')
  async listByWeek(
    @Query('userId') userId: string,
    @Query('from') fromISO: string,
    @Query('to') toISO: string,
  ) {
    return this.svc.findWeek(userId, fromISO, toISO);
  }
}
