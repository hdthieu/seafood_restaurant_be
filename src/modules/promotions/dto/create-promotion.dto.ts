// src/modules/promotions/dto/create-promotion.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested, ArrayUnique, IsUUID, IsArray, Matches } from 'class-validator';
import { ApplyWith, DiscountTypePromotion } from 'src/common/enums';
import { AudienceRulesDto } from './audience-rules.dto';

export class CreatePromotionDto {
    @ApiProperty({ maxLength: 128 })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: DiscountTypePromotion })
    @IsEnum(DiscountTypePromotion)
    discountTypePromotion: DiscountTypePromotion;

    @ApiProperty({ description: 'Giá trị giảm: % hoặc số tiền', example: 20 })
    @IsNumber()
    @Min(0)
    discountValue: number;

    @ApiPropertyOptional({ description: 'Giảm tối đa (nullable)', example: 50000 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    maxDiscountAmount?: number | null;

    @ApiProperty({ description: 'Điều kiện hóa đơn tối thiểu', example: 100000 })
    @IsNumber()
    @Min(0)
    minOrderAmount: number;

    @ApiProperty({ type: String, format: 'date-time' })
    @IsDateString()
    startAt: string;

    @ApiPropertyOptional({ type: String, format: 'date-time' })
    @IsOptional()
    @IsDateString()
    endAt?: string | null;

    @ApiProperty({ enum: ApplyWith })
    @IsEnum(ApplyWith)
    applyWith: ApplyWith;

    @ApiPropertyOptional({ type: AudienceRulesDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => AudienceRulesDto)
    audienceRules?: AudienceRulesDto | null;

    @ApiProperty({ description: 'Mã KM, phải bắt đầu bằng KM-', example: 'KM-LAU50' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^KM-.+$/i, { message: 'promotionCode must start with "KM-"' })
    promotionCode: string;

    @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Category IDs áp dụng' })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsUUID('4', { each: true })
    categoryIds?: string[];

    @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Item IDs áp dụng' })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsUUID('4', { each: true })
    itemIds?: string[];
}
