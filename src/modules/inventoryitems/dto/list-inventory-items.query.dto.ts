// dto/list-inventory-items.query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListInventoryItemsQueryDto {
    @ApiPropertyOptional({
        description: 'Lọc theo Category ID',
        example: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
    })
    @IsOptional()
    @IsUUID('4')
    categoryId?: string;

    @ApiPropertyOptional({ description: 'Trang', example: 1, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Số dòng mỗi trang', example: 20, default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

}