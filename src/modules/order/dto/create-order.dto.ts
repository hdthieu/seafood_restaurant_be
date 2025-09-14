import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from 'src/common/enums';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsUUID() menuItemId: string;

  @ApiProperty({ example: 2 })
  @IsNumber() @Min(1) quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsUUID() tableId: string;

  @ApiPropertyOptional({ enum: OrderType, default: OrderType.DINE_IN })
  @IsEnum(OrderType) @IsOptional()
  orderType?: OrderType = OrderType.DINE_IN;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

