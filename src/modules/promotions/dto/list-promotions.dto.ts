import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApplyWith, DiscountTypePromotion } from 'src/common/enums';

export enum PromotionStatusFilter {
    ALL = 'ALL',
    RUNNING = 'RUNNING',
    UPCOMING = 'UPCOMING',
    EXPIRED = 'EXPIRED',
}

export class ListPromotionsDto {
    @ApiPropertyOptional({ description: 'Search keyword', example: 'Summer Sale' })
    @IsOptional() @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Query string (alias for search)', example: 'Discount' })
    @IsOptional() @IsString()
    q?: string;

    @ApiPropertyOptional({ enum: DiscountTypePromotion, description: 'Filter by discount type' })
    @IsOptional() @IsEnum(DiscountTypePromotion)
    discountTypePromotion?: DiscountTypePromotion;

    @ApiPropertyOptional({ enum: ApplyWith, description: 'Filter by apply with' })
    @IsOptional() @IsEnum(ApplyWith)
    applyWith?: ApplyWith;

    @ApiPropertyOptional({ description: 'Filter by active status', example: true })
    @IsOptional() @IsBoolean()
    @Transform(({ value }) =>
        value === 'true' || value === true ? true :
            value === 'false' || value === false ? false :
                undefined
    )
    isActive?: boolean;

    @ApiPropertyOptional({ enum: PromotionStatusFilter, description: 'Filter by promotion status' })
    @IsOptional() @IsEnum(PromotionStatusFilter)
    status?: PromotionStatusFilter;

    @ApiPropertyOptional({ description: 'Filter promotions starting from this date', example: '2023-01-01' })
    @IsOptional() @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ description: 'Filter promotions ending before this date', example: '2023-12-31' })
    @IsOptional() @IsString()
    dateTo?: string;

    @ApiPropertyOptional({ description: 'Include deleted promotions', example: false })
    @IsOptional() @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    includeDeleted?: boolean;

    @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
    @IsOptional() @IsInt() @Min(1)
    @Transform(({ value }) => Number(value))
    page: number = 1;

    @ApiPropertyOptional({ description: 'Number of items per page', example: 10, minimum: 1, maximum: 100 })
    @IsOptional() @IsInt() @Min(1) @Max(100)
    @Transform(({ value }) => Number(value))
    limit: number = 10;

    @ApiPropertyOptional({ description: 'Sort by field', example: 'createdAt', enum: ['createdAt', 'startAt', 'endAt', 'name'] })
    @IsOptional() @IsString()
    sortBy?: 'createdAt' | 'startAt' | 'endAt' | 'name' = 'createdAt';

    @ApiPropertyOptional({ description: 'Sort direction', example: 'DESC', enum: ['ASC', 'DESC'] })
    @IsOptional() @IsString()
    sortDir?: 'ASC' | 'DESC' = 'DESC';
}