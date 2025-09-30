import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ComboComponentDto } from './combo-component.dto';

export class UpdateComboDto {
    @ApiPropertyOptional({ maxLength: 100, example: 'Combo Hải Sản 209K' })
    @IsOptional() @IsString() @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ example: 209000 })
    @IsOptional() @Type(() => Number) @IsNumber() @IsPositive()
    comboPrice?: number;

    @ApiPropertyOptional({ example: 'Đổi nước sang Sprite' })
    @IsOptional() @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional() @Type(() => Boolean) @IsBoolean()
    isAvailable?: boolean;

    @ApiPropertyOptional({
        description: 'Nếu gửi trường này, hệ thống sẽ thay toàn bộ thành phần combo',
        type: () => [ComboComponentDto],
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
