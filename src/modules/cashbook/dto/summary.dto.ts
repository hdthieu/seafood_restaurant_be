
import { IsOptional, IsString } from 'class-validator';

export class CashbookSummaryDto {
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @IsOptional()
    @IsString()
    dateTo?: string;
}
