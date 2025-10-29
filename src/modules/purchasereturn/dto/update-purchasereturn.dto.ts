import { PartialType } from '@nestjs/swagger';
import { CreatePurchasereturnDto } from './create-purchasereturn.dto';

export class UpdatePurchasereturnDto extends PartialType(CreatePurchasereturnDto) {}
