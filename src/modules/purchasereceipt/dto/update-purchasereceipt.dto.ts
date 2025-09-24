import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseReceiptDto } from './create-purchasereceipt.dto';
import { DiscountType } from 'src/common/enums';

export class UpdatePurchaseReceiptDto {
    supplierId?: string;
    receiptDate?: string;
    globalDiscountType?: DiscountType;
    globalDiscountValue?: number;
    shippingFee?: number;
    note?: string;
    items?: {
        itemId: string;
        quantity: number;
        receivedUnit: string;
        conversionToBase: number;
        unitPrice: number;
        discountType: DiscountType;
        discountValue: number;
        lotNumber?: string;
        expiryDate?: string;
        note?: string;
    }[];
}