import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StaffReportQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    createdBy?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    areaId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    tableId?: string;

    // dùng cho “hàng bán theo NV”
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    q?: string; // mã/tên hàng

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @Transform(({ value }) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : undefined))
    categoryIds?: string[];

    @ApiPropertyOptional({ description: 'Trang (>=1)', default: 1 })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ description: 'Số dòng mỗi trang', default: 10 })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
    @IsInt()
    @Min(1)
    limit?: number;

    // @ApiPropertyOptional()
    // @IsOptional()
    // @Transform(({ value }) => value === true || value === 'true')
    // includeCancelled?: boolean;
}
