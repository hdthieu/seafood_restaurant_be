// src/modules/payroll/dto/pay-payroll.dto.ts
import { IsDateString, IsOptional, IsString, IsUUID, IsArray, IsIn } from 'class-validator';

export class PayPayrollDto {
  @IsDateString()
  payDate: string;

  @IsIn(['CASH', 'BANK'])
  method: 'CASH' | 'BANK';

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  slipIds: string[];
}
