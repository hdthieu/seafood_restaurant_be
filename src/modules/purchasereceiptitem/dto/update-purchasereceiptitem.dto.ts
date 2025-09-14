import { PartialType } from '@nestjs/swagger';
import { CreatePurchasereceiptitemDto } from './create-purchasereceiptitem.dto';

export class UpdatePurchasereceiptitemDto extends PartialType(CreatePurchasereceiptitemDto) {}
