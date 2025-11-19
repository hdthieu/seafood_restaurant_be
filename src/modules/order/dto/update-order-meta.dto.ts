// src/modules/order/dto/update-order-meta.dto.ts
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateOrderMetaDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number | null;
}
