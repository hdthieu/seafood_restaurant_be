import { PartialType } from '@nestjs/mapped-types';
import { CreateInventoryitemDto } from './create-inventoryitem.dto';

export class UpdateInventoryitemDto extends PartialType(CreateInventoryitemDto) {}
