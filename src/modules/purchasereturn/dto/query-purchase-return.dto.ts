// dto/query-supplier-group.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PurchaseReturnStatus } from 'src/common/enums';

export class QueryPurchaseReturnDto {
    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ example: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;

    @ApiPropertyOptional({ example: '' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: PurchaseReturnStatus, required: false })
    @IsOptional()
    @IsEnum(PurchaseReturnStatus)
    status?: PurchaseReturnStatus;

    @ApiPropertyOptional({ example: 'uuid-of-supplier', required: false })
    @IsOptional()
    @IsString()
    supplierId?: string;

    @ApiPropertyOptional({ example: 'createdAt', description: 'createdAt|name|code' })
    @IsOptional()
    @IsString()
    sortBy?: 'createdAt' | 'name' | 'code' = 'createdAt';

    @ApiPropertyOptional({ example: 'DESC', description: 'ASC|DESC' })
    @IsOptional()
    @IsString()
    sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
