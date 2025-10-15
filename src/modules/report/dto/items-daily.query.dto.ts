import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseRangeDto } from './base-range.dto';

/** Báo cáo “Hàng hóa” */
export class ItemsDailyQueryDto extends BaseRangeDto {
    @ApiPropertyOptional({ description: 'Tìm theo tên/mã hàng' })
    @IsOptional() 
    @IsString() 
    q?: string;

    @ApiPropertyOptional({ type: [String], description: 'Lọc theo nhóm hàng (categoryIds)' })
    @IsOptional() 
    @IsArray()
    @Transform(({ value }) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : undefined))
    @IsUUID('4', { each: true })
    categoryIds?: string[];
}
