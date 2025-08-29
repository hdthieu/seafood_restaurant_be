import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { AreaStatus, TableStatus } from 'src/common/enums';

// dto/create-area.dto.ts
export class CreateAreaDto {
    @ApiProperty({ example: 'Lầu 1' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'Có ban công' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({ example: 'AVAILABLE' })
    @IsOptional()
    @IsEnum(AreaStatus)
    status?: AreaStatus;
}
