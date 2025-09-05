import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, IsUUID } from 'class-validator';
import { TableStatus } from 'src/common/enums';

export class UpdateTableDto {

    @ApiProperty({ example: 'Bàn 1' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 4 })
    @IsOptional()
    @IsInt()
    @Min(1)
    seats?: number;

    @ApiProperty({ example: 'Bàn gần cửa ra vào' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({ example: TableStatus.ACTIVE, enum: TableStatus })
    @IsOptional()
    @IsEnum(TableStatus)
    status?: TableStatus;

}
