import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListUnitsOfMeasureQueryDto {
    @ApiProperty({ required: false, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 1 : Number(value))
    page?: number = 1;

    @ApiProperty({ required: false, example: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 20 : Number(value))
    limit?: number = 20;
}