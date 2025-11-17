// update-inventoryitem.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateInventoryitemDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    alertThreshold?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    categoryId?: string | null;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    supplierIds?: string[];
}
