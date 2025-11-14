import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { BaseRangeDto } from './base-range.dto';

export class ProfitDailyQueryDto extends BaseRangeDto {
    @ApiPropertyOptional({ enum: ['day'], default: 'day' })
    @IsOptional()
    @IsIn(['day'])
    granularity?: 'day' = 'day';
}

export class ProfitByInvoiceQueryDto extends BaseRangeDto { }
