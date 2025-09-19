import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseReceiptDto } from './create-purchasereceipt.dto';

export class UpdatePurchasereceiptDto extends PartialType(CreatePurchaseReceiptDto) {}
