import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Channel } from 'src/common/enums';

export class StaffReportQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @ApiPropertyOptional({ enum: Channel })
    @IsOptional()
    @IsEnum(Channel)
    channel?: Channel;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    receiverId?: string; // lọc 1 nhân viên

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    areaId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    tableId?: string;

    // dùng cho “hàng bán theo NV”
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    q?: string; // mã/tên hàng

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @Transform(({ value }) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : undefined))
    categoryIds?: string[];

    // @ApiPropertyOptional()
    // @IsOptional()
    // @Transform(({ value }) => value === true || value === 'true')
    // includeCancelled?: boolean;
}
