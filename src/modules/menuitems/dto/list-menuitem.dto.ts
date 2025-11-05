// src/menu-items/dto/get-menu-items.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMenuItemsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Tìm theo name/description' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo danh mục' })
  @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy món đang sẵn sàng' })
  @IsOptional() @IsBooleanString()
  isAvailable?: string; // "true" | "false"

  @ApiPropertyOptional({ description: 'Giá min' })
  @IsOptional() @Type(() => Number) @IsPositive()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá max' })
  @IsOptional() @Type(() => Number) @IsPositive()
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['name', 'price', 'createdAt'], default: 'name' })
  @IsOptional() @IsIn(['name', 'price', 'createdAt'])
  sortBy?: 'name' | 'price' | 'createdAt' = 'name';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional() @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';

  @ApiPropertyOptional({ description: 'Có kèm khuyến mãi hay không', default: false })
  @IsOptional() @IsBooleanString()
  withPromotions?: boolean;
}
