import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApplyWith, DiscountTypePromotion } from 'src/common/enums';
import { PromotionRulesDto } from './rules.dto';
import { PromotionTargetDto } from './target.dto';
export class CreatePromotionDto {
    @ApiProperty({ example: 'Happy Hour -20% toàn bill (trần 50k)' })
    @IsString()
    @MaxLength(128)
    name!: string;

    @ApiProperty({ enum: DiscountTypePromotion, example: DiscountTypePromotion.PERCENT })
    @IsEnum(DiscountTypePromotion)
    discountTypePromotion!: DiscountTypePromotion;

    @ApiProperty({ example: 20, description: 'Nếu PERCENT → 20 nghĩa là 20%; nếu AMOUNT → số tiền' })
    @IsNumber()
    @Min(0)
    discountValue!: number;

    @ApiPropertyOptional({ example: 50000, description: 'Trần giảm tối đa; null nếu không giới hạn' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    maxDiscountAmount?: number | null;

    @ApiProperty({ example: 0 })
    @IsNumber()
    @Min(0)
    minOrderAmount!: number;

    @ApiProperty({ example: '2025-10-01T15:00:00.000Z' })
    @IsDateString()
    startAt!: string;

    @ApiPropertyOptional({ example: '2025-12-31T16:59:59.000Z' })
    @IsOptional()
    @IsDateString()
    endAt?: string | null;

    @ApiProperty({ enum: ApplyWith, example: ApplyWith.ORDER })
    @IsEnum(ApplyWith)
    applyWith!: ApplyWith;

    @ApiPropertyOptional({
        type: () => [PromotionTargetDto],
        example: [{ type: 'CATEGORY', id: 'uuid-category-nuong' }],
        description: 'Khi applyWith = CATEGORY/ITEM/TABLE/AREA',
    })
    @IsOptional()
    targets?: PromotionTargetDto[] | null;

    @ApiPropertyOptional({
        type: () => PromotionRulesDto,
        example: { birthdayOnly: false, daysOfWeek: [5, 6], timeWindows: [{ start: '15:00', end: '17:00' }] },
    })
    @IsOptional()
    rules?: PromotionRulesDto | null;


    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ example: false, description: 'Có cho phép cộng dồn với KM khác hay không' })
    @IsOptional()
    @IsBoolean()
    stackable?: boolean;

    @ApiPropertyOptional({ example: 'Áp dụng trong khung giờ 15:00–17:00' })
    @IsOptional()
    @IsString()
    description?: string | null;
}