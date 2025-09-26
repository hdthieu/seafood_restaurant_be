import { CreatePurchaseReceiptItemDto } from '@modules/purchasereceiptitem/dto/create-purchasereceiptitem.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { DiscountType, ReceiptStatus } from 'src/common/enums';
import { CreatePurchaseReceiptDto } from './create-purchasereceipt.dto';

export class UpdatePurchaseReceiptDto extends CreatePurchaseReceiptDto {
    @ApiPropertyOptional({ example: 'PAID', enum: ReceiptStatus })
    @IsEnum(ReceiptStatus) @IsOptional()
    status?: ReceiptStatus;

    @ApiPropertyOptional({ example: 'user-uuid' })
    @IsUUID() @IsOptional()
    updatedBy?: string;
}
