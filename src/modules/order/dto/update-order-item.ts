// src/modules/orders/dto/update-orderitem-qty.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateOrderItemQtyDto {
  @ApiProperty({ example: 3, minimum: 0, description: 'Số lượng muốn đặt (0 = xoá món)' })
  @IsInt()
  @Min(0)
  quantity: number;
}
