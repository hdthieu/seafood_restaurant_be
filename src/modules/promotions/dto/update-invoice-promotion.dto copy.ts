// src/modules/invoice-promotion/dto/update-invoice-promotion.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ApplyWith } from 'src/common/enums';

export class UpdateInvoicePromotionDto {
    @ApiPropertyOptional({ enum: ApplyWith })
    @IsOptional()
    @IsEnum(ApplyWith)
    applyWith?: ApplyWith;

    @ApiPropertyOptional({ example: 300000 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    calculationBase?: number;

    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    giftsCount?: number;
}
