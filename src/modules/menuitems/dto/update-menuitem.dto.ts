import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
class UpdateIngredientInput {
  @ApiPropertyOptional({ description: 'ID inventoryItem' })
  @IsUUID()
  inventoryItemId!: string;

  @ApiPropertyOptional()
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Đơn vị của quantity (mặc định là base UOM của nguyên liệu)' })
  @IsOptional()
  @IsString()
  uomCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsBooleanString()
  isAvailable?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Cho phép khách trả lại món này'
  })
  @IsOptional() @IsBooleanString()
  isReturnable?: string;

  // ingredients có thể là JSON string khi multipart
  @ApiPropertyOptional({
    type: [UpdateIngredientInput],
    description: 'Thay toàn bộ danh sách nguyên liệu cho món',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    return value;
  })
  @IsArray() @ValidateNested({ each: true })
  @Type(() => UpdateIngredientInput)
  ingredients?: UpdateIngredientInput[];
}
