import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddOrderItemDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsUUID() menuItemId: string;

  @ApiProperty({ example: 1 })
  @IsNumber() @Min(1) quantity: number;
}

export class AddItemsDto {
  @ApiProperty({ type: [AddOrderItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AddOrderItemDto)
  items: AddOrderItemDto[];
}

