// src/modules/purchasereturn/dto/standalone-return.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty, IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive,
    IsString, ValidateNested, IsUUID, Min, IsEnum
} from 'class-validator';
import { DiscountType } from 'src/common/enums';

class StandaloneLineDto {
    @ApiProperty({ example: 'uuid-of-item' })
    @IsNotEmpty() @IsUUID()
    itemId: string;

    @ApiProperty({ example: 10 })
    @IsNotEmpty() @Type(() => Number) @IsNumber() @IsPositive()
    quantity: number;

    @ApiProperty({ example: 15000 })
    @Type(() => Number) @IsNumber() @Min(0)
    unitPrice: number;

    @ApiProperty({ example: 'KG', required: false })
    @IsOptional() @IsString()
    receivedUomCode?: string;

    // conversionToBase removed: factor is resolved from UOM conversions in DB

}

export class StandaloneReturnDto {
    @ApiProperty({ example: 'uuid-of-supplier' })
    @IsNotEmpty() @IsUUID()
    supplierId: string;

    @ApiProperty({ type: [StandaloneLineDto] })
    @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => StandaloneLineDto)
    items: StandaloneLineDto[];

    @ApiProperty({ example: 'Hàng hỏng/không đạt' })
    @IsNotEmpty() @IsString()
    reason: string;

    // Giảm mức PHIẾU (header)
    @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.AMOUNT })
    @IsEnum(DiscountType) @IsOptional()
    discountType?: DiscountType = DiscountType.AMOUNT;

    @ApiPropertyOptional({ example: 0 })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    discountValue?: number = 0;

    // ===== NEW: NCC đã hoàn thực tế khi tạo phiếu
    @ApiPropertyOptional({ example: 400000, description: 'Số tiền NCC đã hoàn (<= refundAmount)' })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    paidAmount?: number = 0;
}
