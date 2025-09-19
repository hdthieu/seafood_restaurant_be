import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseReceiptItemDto } from './create-purchasereceiptitem.dto';

export class UpdatePurchasereceiptitemDto extends PartialType(CreatePurchaseReceiptItemDto) { }
