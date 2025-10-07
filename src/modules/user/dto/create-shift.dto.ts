// src/modules/shift/dto/create-shift.dto.ts
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateShiftDto {
  @IsString() @Length(1, 120)
  name: string;

  // HH:mm 00-23:59
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  color?: string;
}
