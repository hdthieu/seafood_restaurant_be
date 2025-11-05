// src/modules/inventoryitems/dto/list-ingredients.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { StockFilter } from 'src/common/enums';
import { IsUUID } from 'class-validator';

export class ListIngredientsDto {
    @ApiPropertyOptional({ description: 'Từ khóa tên hoặc đơn vị (code/name)', example: 'bia' })
    @IsOptional() @IsString()
    q?: string;

    @ApiPropertyOptional({ description: 'Lọc theo đơn vị cơ bản (mã UOM)', example: 'CAN' })
    @IsOptional() @IsString()
    baseUomCode?: string;

    @ApiPropertyOptional({ enum: StockFilter, default: StockFilter.ALL })
    @IsOptional() @IsEnum(StockFilter)
    stock?: StockFilter = StockFilter.ALL;

    @ApiPropertyOptional({ default: 1, minimum: 1 })
    @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
    @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1)
    limit: number = 10;
     @ApiPropertyOptional({
    description: 'Lọc theo nhà cung cấp (UUID của Supplier)',
    example: 'f7c42739-fd45-4df1-a313-f3710ad65c75',
  })
     @IsOptional() @IsUUID()
  supplierId?: string;
}
