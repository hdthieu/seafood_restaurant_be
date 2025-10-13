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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ enum: ['true','false'] })
  @IsOptional() @IsBooleanString()
  isAvailable?: string;

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
