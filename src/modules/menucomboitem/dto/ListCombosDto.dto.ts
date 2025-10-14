import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListCombosDto {
    @ApiPropertyOptional({ description: 'Tìm theo tên/mã', example: 'tôm' })
    @IsOptional() @IsString()
    q?: string;

    @ApiPropertyOptional({ description: 'Lọc theo danh mục', example: 'uuid-category' })
    @IsOptional() @IsUUID()
    categoryId?: string;

    @ApiPropertyOptional({ description: 'Giá tối thiểu', example: 50000 })
    @IsOptional()
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    priceMin?: number;

    @ApiPropertyOptional({ description: 'Giá tối đa', example: 200000 })
    @IsOptional()
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    priceMax?: number;

    @ApiPropertyOptional({ enum: ['name', 'price', 'createdAt'], default: 'name' })
    @IsOptional() @IsEnum(['name', 'price', 'createdAt'] as const)
    sortBy?: 'name' | 'price' | 'createdAt' = 'name';

    @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
    @IsOptional() @IsEnum(['ASC', 'DESC'] as const)
    sortDir?: 'ASC' | 'DESC' = 'ASC';

    @ApiPropertyOptional({ default: 1, minimum: 1 })
    @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
    @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(100)
    limit: number = 10;
}
