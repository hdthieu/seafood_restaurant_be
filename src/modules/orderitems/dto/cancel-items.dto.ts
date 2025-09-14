// src/modules/orderitems/dto/cancel-items.dto.ts
import { IsArray, ArrayNotEmpty, IsString, IsNotEmpty } from 'class-validator';

export class CancelItemsDto {
  @IsArray() @ArrayNotEmpty()
  itemIds!: string[];

  @IsString() @IsNotEmpty()
  reason!: string;
}
