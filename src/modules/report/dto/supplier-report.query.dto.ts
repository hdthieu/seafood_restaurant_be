import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SupplierReportQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD start date (local VN)' })
    @IsOptional() @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD end date (inclusive, local VN)' })
    @IsOptional() @IsString()
    dateTo?: string;

    @ApiPropertyOptional({ description: 'Filter by supplier id' })
    @IsOptional() @IsString()
    supplierId?: string;

    @ApiPropertyOptional({ description: 'Search supplier by code/name/phone' })
    @IsOptional() @IsString()
    supplierQ?: string;

    // Removed itemQ per request

    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : value)) @Type(() => Number) @IsInt() @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Page size', default: 50 })
    @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : value)) @Type(() => Number) @IsInt() @Min(1)
    limit?: number = 50;

    @ApiPropertyOptional({ description: 'Limit for top suppliers endpoint', default: 10 })
    @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : value)) @Type(() => Number) @IsInt() @Min(1)
    topLimit?: number = 10;
}
