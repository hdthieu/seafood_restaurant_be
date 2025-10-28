// src/modules/orders/dto/merge-order.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class MergeOrderDto {
  @IsOptional()
  @IsUUID()
  targetOrderId!: string;   // đơn đích để ghép vào (đang OPEN)

  // (tùy chọn) nếu bạn muốn hiển thị theo bàn trước:
  // @IsUUID() targetTableId?: string;
}
