import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from 'src/common/enums';
import { CreatePurchaseReceiptItemDto } from '@modules/purchasereceiptitem/dto/create-purchasereceiptitem.dto';

export class CreatePurchaseReceiptDto {
    @ApiProperty({ example: 'supplier-uuid' })
    @IsUUID()
    supplierId: string;

    @ApiProperty({ example: '2025-09-19' })
    @IsDateString()
    receiptDate: string;

    @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.AMOUNT })
    @IsEnum(DiscountType) @IsOptional()
    globalDiscountType?: DiscountType = DiscountType.AMOUNT;

    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    @ValidateIf(o => o.globalDiscountType === DiscountType.PERCENT)
    @Max(100, { message: 'Chiết khấu phần trăm không được quá 100%' })
    globalDiscountValue?: number = 0;

    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    shippingFee?: number = 0;

    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    amountPaid?: number = 0;

    @ApiPropertyOptional({ example: 'Ghi chú phiếu' })
    @IsOptional()
    @MaxLength(2000)
    note?: string;

    @ApiProperty({ type: [CreatePurchaseReceiptItemDto] })
    @ArrayMinSize(1)
    @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePurchaseReceiptItemDto)
    items: CreatePurchaseReceiptItemDto[];
}