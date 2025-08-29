import { PartialType } from '@nestjs/mapped-types';
import { CreateInventorytransactionDto } from './create-inventorytransaction.dto';

export class UpdateInventorytransactionDto extends PartialType(CreateInventorytransactionDto) {}
