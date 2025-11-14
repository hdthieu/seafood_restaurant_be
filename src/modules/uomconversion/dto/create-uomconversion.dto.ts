import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUomconversionDto {
    @ApiProperty({ example: 'VI', description: 'Mã UOM nguồn (from_code)' })
    @IsString()
    @IsNotEmpty()
    fromCode: string;

    @ApiProperty({ example: 'EA', description: 'Mã UOM đích (to_code)' })
    @IsString()
    @IsNotEmpty()
    toCode: string;

    @ApiProperty({ example: 10, description: 'Hệ số quy đổi: 1 from = factor * to' })
    @Transform(({ value }) => Number(value))
    @IsNumber()
    @IsPositive()
    factor: number;
}
