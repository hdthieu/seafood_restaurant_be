// src/modules/payroll/dto/create-payroll.dto.ts
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';

export class CreatePayrollDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsDateString()
  workDateFrom: string;

  @IsDateString()
  workDateTo: string;

  @IsString()
  payCycle: string; // "MONTHLY"...

  @IsBoolean()
  applyAllStaff: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  staffIds?: string[];
}
