// src/orders/dto/open-tables.query.ts
import { IsOptional, IsUUID } from 'class-validator';

export class OpenTablesQueryDto {
  @IsOptional()
  @IsUUID()
  excludeOrderId?: string;

  @IsOptional()
  @IsUUID()
  excludeTableId?: string;
}
