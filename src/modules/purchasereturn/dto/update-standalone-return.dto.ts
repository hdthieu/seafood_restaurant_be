import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNumber, IsOptional, IsPositive, IsString, ValidateNested, IsUUID, Min, IsEnum } from 'class-validator';
import { DiscountType } from 'src/common/enums';

class UpdateStandaloneLineDto {
    @ApiProperty({ example: 'uuid-of-item', required: false })
    @IsOptional() @IsUUID()
    itemId?: string;

    @ApiProperty({ example: 10, required: false })
    @IsOptional() @Type(() => Number) @IsNumber() @IsPositive()
    quantity?: number;

    @ApiProperty({ example: 15000, required: false })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    unitPrice?: number;

    @ApiProperty({ example: 'KG', required: false })
    @IsOptional() @IsString()
    receivedUomCode?: string;

    // conversionToBase removed: factor is resolved from UOM conversions in DB

}

export class UpdateStandaloneReturnDto {
    @ApiProperty({ example: 'uuid-of-supplier', required: false })
    @IsOptional() @IsUUID()
    supplierId?: string;

    @ApiProperty({ type: [UpdateStandaloneLineDto], required: false })
    @IsOptional() @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => UpdateStandaloneLineDto)
    items?: UpdateStandaloneLineDto[];

    @ApiProperty({ example: 'Hàng hỏng/không đạt', required: false })
    @IsOptional() @IsString()
    reason?: string;

    @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.AMOUNT })
    @IsEnum(DiscountType) @IsOptional()
    discountType?: DiscountType = DiscountType.AMOUNT;

    @ApiPropertyOptional({ example: 0 })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    discountValue?: number = 0;

    // Cho phép chỉnh paidAmount (khi DRAFT: tự do; khi POSTED: chỉ cho phép paidAmount/refundAmount)
    @ApiPropertyOptional({ example: 40995, description: 'Cập nhật số tiền NCC đã hoàn' })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    paidAmount?: number;

    // (Giữ logic cũ) cho phép update refundAmount khi POSTED
    @ApiProperty({ example: 40995, required: false })
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    refundAmount?: number;
}