// dto/create-combo.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ComboComponentDto } from './combo-component.dto';

export class CreateComboDto {
  @ApiProperty({ maxLength: 100, example: 'Combo Hải Sản 199K' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string;

  @ApiProperty({ example: 199000 })
  @Type(() => Number) @IsNumber() @IsPositive()
  comboPrice: number;

  @ApiPropertyOptional({ example: 'Lẩu nhỏ + 1 nước' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  image?: any;

  @ApiPropertyOptional({ example: true, default: true })
  @Type(() => Boolean) @IsOptional() @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({
    description: 'Danh sách thành phần (có thể là JSON string, object indexed, hoặc array)',
    type: () => [ComboComponentDto],
    example: [
      { itemId: 'uuid-lau-hai-san', quantity: 1 },
      { itemId: 'uuid-coca-330', quantity: 1 }
    ]
  })
  @Transform(({ value }) => {
    if (value == null || value === '') return [];

    // nếu là chuỗi: thử decode + parse
    if (typeof value === 'string') {
      try {
        const s = decodeURIComponent(value);
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch { return []; }
      }
    }

    // nếu là object dạng {"0": "..."} hoặc object đơn
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.every(k => /^\d+$/.test(k))) {
        return keys.sort((a, b) => +a - +b).map(k => value[k]);
      }
      if ('itemId' in value || 'quantity' in value) return [value];
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  components: ComboComponentDto[];

}
