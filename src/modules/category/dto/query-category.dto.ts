// src/modules/category/dto/query-category.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type as TransformType } from 'class-transformer';
import { CategoryType } from 'src/common/enums';

export class QueryCategoryDto {
    @ApiPropertyOptional({ enum: CategoryType })
    @IsEnum(CategoryType) @IsOptional()
    type?: CategoryType;

    @ApiPropertyOptional({ description: 'true/false' })
    @IsBooleanString() @IsOptional()
    isActive?: string;

    @ApiPropertyOptional({ description: 'Tìm theo tên/mô tả' })
    @IsString() @IsOptional()
    q?: string;

    @ApiPropertyOptional({ example: 1 })
    @TransformType(() => Number) @IsInt() @Min(1) @IsOptional()
    page?: number = 1;

    @ApiPropertyOptional({ example: 10 })
    @TransformType(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
    limit?: number = 10;

    @ApiPropertyOptional({ example: 'createdAt:DESC', description: 'field:ASC|DESC (ví dụ createdAt:DESC)' })
    @IsString() @IsOptional()
    sort?: string; // ví dụ: "createdAt:DESC"
}
