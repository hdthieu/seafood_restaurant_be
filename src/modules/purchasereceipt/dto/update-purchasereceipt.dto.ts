import { PartialType } from '@nestjs/swagger';
import { CreatePurchasereceiptDto } from './create-purchasereceipt.dto';

export class UpdatePurchasereceiptDto extends PartialType(CreatePurchasereceiptDto) {}
