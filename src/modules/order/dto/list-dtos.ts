import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsOptional } from 'class-validator';
import { OrderStatus } from 'src/common/enums';

export class ListOrdersDto {
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional() @IsEnum(OrderStatus)
  status?: OrderStatus;
}
