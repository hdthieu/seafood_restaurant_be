// src/modules/payroll/dto/list-payroll.dto.ts
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListPayrollDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string; // PayrollStatus
}
