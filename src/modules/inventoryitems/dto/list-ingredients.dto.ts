import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListIngredientsDto {
    @IsOptional() @IsString() q?: string;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt() @Min(1)
    page: number = 1;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt() @Min(1)
    limit: number = 10;
}