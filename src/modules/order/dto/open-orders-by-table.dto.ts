// src/orders/dto/open-orders-by-table.query.ts
import { IsOptional, IsUUID } from 'class-validator';

export class OpenOrdersByTableQueryDto {
  @IsOptional()
  @IsUUID()
  excludeOrderId?: string;

  @IsOptional()
  @IsUUID()
  excludeTableId?: string; // dùng tên này thống nhất FE/BE
}

export class OpenInTableQueryDto {
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsUUID()
  excludeOrderId?: string;
}
