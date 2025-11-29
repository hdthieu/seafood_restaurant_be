import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListUomConversionQueryDto {
    @ApiProperty({ required: false, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 1 : Number(value))
    page?: number = 1;

    @ApiProperty({ required: false, example: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 50 : Number(value))
    limit?: number = 50;

    @ApiProperty({ required: false, example: 'ML' })
    @IsOptional()
    fromCode?: string;

    @ApiProperty({ required: false, example: 'L' })
    @IsOptional()
    toCode?: string;
}