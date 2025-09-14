// src/modules/order/dto/attach-customer.dto.ts
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class AttachCustomerDto {
  // 1 trong 3 cách: customerId | phone(+name) | walkin
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() name?: string; // dùng khi upsert theo phone
  @IsOptional() @IsBoolean() walkin?: boolean;
}