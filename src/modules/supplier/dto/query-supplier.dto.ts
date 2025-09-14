import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsOptional,
    IsPositive,
    IsString,
    IsUUID,
    Max,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupplierStatus } from 'src/common/enums';

export class QuerySupplierDto {
    @ApiPropertyOptional({
        description: 'Search text (code/name/phone/email/taxCode/address)',
    })
    @IsOptional()
    @IsString()
    q?: string;

    @ApiPropertyOptional({ enum: SupplierStatus })
    @IsOptional()
    @IsEnum(SupplierStatus)
    status?: SupplierStatus;

    /** 🔹 lọc theo nhóm NCC */
    @ApiPropertyOptional({
        description: 'Filter by SupplierGroup ID',
        example: '2f3a8e47-9c45-4a11-9e9f-2a42e46adabc',
    })
    @IsOptional()
    @IsUUID()
    supplierGroupId?: string;

    /** 🔹 lọc theo thành phố */
    @ApiPropertyOptional({ description: 'Filter by city', example: 'Hồ Chí Minh' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    page: number = 1;

    @ApiPropertyOptional({ default: 20, maximum: 100 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 20;

    /** 🔹 option: có load kèm supplierGroup hay không */
    @ApiPropertyOptional({
        description: 'Include SupplierGroup relation',
        default: false,
    })
    @IsOptional()
    withGroup?: boolean;
}
