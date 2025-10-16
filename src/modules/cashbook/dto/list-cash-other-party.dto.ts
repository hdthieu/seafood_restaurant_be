import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class ListCashOtherPartyDto {
    @IsOptional()
    @IsString()
    q?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}