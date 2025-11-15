import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteUomConversionDto {
    @ApiProperty({ example: 'VI' })
    @IsString() @IsNotEmpty()
    fromCode!: string;

    @ApiProperty({ example: 'EA' })
    @IsString() @IsNotEmpty()
    toCode!: string;
}
