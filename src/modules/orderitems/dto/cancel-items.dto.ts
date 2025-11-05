// src/modules/orderitems/dto/cancel-items.dto.ts
import { IsArray, ArrayNotEmpty, IsString, IsNotEmpty } from 'class-validator';
import { IsInt, Min, IsOptional, IsUUID } from 'class-validator';
export class CancelItemsDto {
  @IsArray() @ArrayNotEmpty()
  itemIds!: string[];

  @IsString() @IsNotEmpty()
  reason!: string;
}
export class CancelPartialDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) qty: number;      // số lượng cần huỷ
  @IsString() @IsOptional() reason?: string;
  
}