// src/modules/invoice/dto/query-invoices.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { InvoiceStatus } from 'src/common/enums';

export class QueryInvoicesDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  q?: string; // mã HĐ, tên KH, ghi chú, tên bàn

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional() @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '2025-09-01' })
  @IsOptional() @IsString()
  fromDate?: string; // ISO date or datetime

  @ApiPropertyOptional({ example: '2025-09-30' })
  @IsOptional() @IsString()
  toDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit: number = 20;
}
