import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateUnitsOfMeasureDto {
    @ApiProperty({ example: 'Vỉ', description: 'Tên đầy đủ đơn vị' })
    @IsString()
    @Length(1, 64)
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'count', enum: ['mass', 'volume', 'count', 'length'] })
    @IsString()
    @IsIn(['mass', 'volume', 'count', 'length'])
    dimension: 'mass' | 'volume' | 'count' | 'length';
}
