import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from "class-validator";
import { DiscountType } from "src/common/enums";

export class CreatePurchaseReceiptItemDto {
    @IsUUID() itemId: string;

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsOptional()
    @IsString()
    receivedUnit?: string;

    @IsNumber()
    @IsPositive()
    conversionToBase: number;

    @IsNumber()
    @Min(0)
    unitPrice: number;

    @IsEnum(DiscountType) @IsOptional()
    discountType?: DiscountType = DiscountType.AMOUNT;

    @IsNumber()
    @Min(0)
    @Max(100, { each: false, message: 'discountValue must be <= 100 when type=PERCENT' })
    discountValue: number;

    @IsOptional() @IsString()
    lotNumber?: string;

    @IsOptional()
    @IsDateString()
    expiryDate?: string;

    @IsOptional() @IsString()
    note?: string;
}