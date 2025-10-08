// src/modules/attendance/dto/mobile-check.dto.ts
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CheckType } from '../entities/attendance';

export class MobileCheckDto {
  @IsEnum(CheckType) checkType: CheckType;          // IN | OUT
  @IsString() dateISO: string;                      // YYYY-MM-DD
  @IsOptional() @IsString() shiftId?: string;       // nếu có
  // GPS
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsNumber() accuracy?: number;      // mét
  @IsOptional() @IsNumber() clientTs?: number;      // ms epoch
  // mạng
  @IsOptional() @IsString() netType?: 'wifi'|'cellular'|'unknown';
  @IsOptional() @IsString() ssid?: string;
  @IsOptional() @IsString() bssid?: string;
}
