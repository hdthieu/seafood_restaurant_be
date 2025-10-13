// dto/table-transactions.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InvoiceStatus } from 'src/common/enums';

export class TableTransactionsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 10 })
  @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 10;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional() @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}
