import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Channel } from 'src/common/enums';

export class BaseRangeDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateTo?: string;


    // @ApiPropertyOptional({ enum: Channel }) 
    // @IsOptional() 
    // @IsEnum(Channel) 
    // channel?: Channel;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    areaId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    tableId?: string;

    // @ApiPropertyOptional() 
    // @IsOptional() 
    // @IsUUID() 
    // receiverId?: string;  // người nhận đơn

    // @ApiPropertyOptional() 
    // @IsOptional() 
    // @IsUUID() 
    // creatorId?: string;   // người tạo

    // @ApiPropertyOptional()
    // @IsOptional()
    // @Transform(({ value }) => value === true || value === 'true')
    // includeCancelled?: boolean;

    @ApiPropertyOptional({
        type: Number,
        minimum: 1,
        default: 1,
        description: 'Trang (>=1)',
    })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        type: Number,
        minimum: 1,
        default: 10,
        description: 'Số dòng mỗi trang',
    })
    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number;
}
