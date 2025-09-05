// dto/create-menuitem.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested
} from 'class-validator';

export class IngredientDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-1234-567890abcd' })
  @IsUUID()
  inventoryItemId: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber() @Min(0)
  quantity: number;

  @ApiPropertyOptional({ example: 'Tươi' })
  @IsString() @IsOptional()
  note?: string;
}

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Lẩu Tomyum' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 250000 })
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber() @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'Món lẩu tôm yum ngon' })
  @IsString() @IsOptional()
  description?: string;

  // file upload (multipart) — đi riêng qua @UploadedFile, để optional cho Swagger
  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Ảnh món (file upload)' })
  image?: any;

  @ApiProperty({ example: '9c0a8e3c-0d4f-4b21-b6d7-123456789abc' })
  @IsUUID()
  categoryId: string;

  // ✅ Nhận array<object> hoặc string JSON -> ép về array<object>
  @ApiProperty({
    type: [IngredientDto],
    example: [
      { inventoryItemId: 'a1b2c3d4-e5f6-7890-1234-567890abcd', quantity: 0.5, note: 'Tươi' },
      { inventoryItemId: 'b2c3d4e5-f6a1-7890-1234-567890abcd', quantity: 1 }
    ],
  })
  @Transform(({ value }) => {
    // nếu Swagger gửi string -> parse
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { /* giữ nguyên để validator báo lỗi */ }
    }
    // nếu gửi object đơn -> bọc thành mảng
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('inventoryItemId' in value || 'quantity' in value) return [value];
      // dạng indexed { "0": {...}, "1": {...} }
      const keys = Object.keys(value);
      if (keys.every(k => /^\d+$/.test(k))) {
        return keys.sort((a,b) => +a - +b).map(k => value[k]);
      }
    }
    return value;
  })
  @IsArray({ message: 'ingredients must be an array' })
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients: IngredientDto[];
}
