import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max, IsString, IsEnum } from 'class-validator';
import { TableStatus } from 'src/common/enums';
export class QueryTableDto {
  @ApiPropertyOptional({ type: Number, example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, example: 12, description: 'Số item mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 12;

  @ApiPropertyOptional({ type: String, example: 'Tầng 1' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ type: String, example: 'Bàn 1' })
  @IsOptional()
  @IsString()
  search?: string;
  @IsOptional()
  @IsEnum(TableStatus, { message: "status must be ACTIVE or INACTIVE" })
  status?: TableStatus; 
}
