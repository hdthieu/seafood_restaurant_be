import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateUnitsOfMeasureDto {
    @ApiProperty({ example: 'VI', description: 'Mã đơn vị (viết tắt), duy nhất, ví dụ: VI = vỉ trứng' })
    @IsString()
    @Length(1, 32)
    @IsNotEmpty()
    code: string;

    @ApiProperty({ example: 'Vỉ', description: 'Tên đầy đủ đơn vị' })
    @IsString()
    @Length(1, 64)
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'count', enum: ['mass', 'volume', 'count', 'length'] })
    @IsString()
    @IsIn(['mass', 'volume', 'count', 'length'])
    dimension: 'mass' | 'volume' | 'count' | 'length';

    @ApiProperty({ example: 'EA', description: 'Mã đơn vị cơ bản (nếu có), ví dụ: EA = each (cái)' })
    @IsOptional()
    @IsString()
    baseCode?: string;
}
