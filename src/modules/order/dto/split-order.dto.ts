// src/modules/order/dto/split-order.dto.ts
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SplitItemDto {
  @IsUUID() itemId!: string;            // orderItem.id
  @IsInt() @Min(1) quantity!: number;   // số lượng muốn tách
}

export class SplitOrderDto {
  @IsIn(['create-new', 'to-existing'])
  mode!: 'create-new' | 'to-existing';

  // mode = create-new
  @IsOptional() @IsUUID()
  tableId?: string;

  // mode = to-existing
  @IsOptional() @IsUUID()
  toOrderId?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => SplitItemDto)
  items!: SplitItemDto[];
}
