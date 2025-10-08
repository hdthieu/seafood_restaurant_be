// src/modules/user/dto/mobile-schedule.dto.ts
export class MobileScheduleDto {
  id: string;          // work_schedules.id (scheduleId)
  date: string;        // 'YYYY-MM-DD'
  shiftId: string;
  shiftName: string;
  start: string;       // 'HH:mm'
  end: string;         // 'HH:mm'
  status: 'planned' | 'in' | 'out';
  attendanceId?: string | null;
}
