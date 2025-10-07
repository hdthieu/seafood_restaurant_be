// src/modules/user/dto/create-schedule.dto.ts
import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateScheduleDto {
  @IsUUID() userId: string;
  @IsDateString() date: string;      // "2025-10-06"
  @IsUUID() shiftId: string;
  @IsOptional() @IsString() note?: string;

  // các tuỳ chọn mở rộng
  @IsOptional() @IsBoolean() repeatWeekly?: boolean; // lặp mỗi tuần
  @IsOptional() @IsDateString() repeatUntil?: string; // ngày kết thúc lặp (inclusive)
  @IsOptional() @IsArray() applyToUserIds?: string[]; // áp dụng cho nhiều user
}

export class UpdateScheduleDto {
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() note?: string;
}
