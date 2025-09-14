import { PartialType } from '@nestjs/swagger';
import { CreateSupplierGroupDto } from './create-suppliergroup.dto';

export class UpdateSuppliergroupDto extends PartialType(CreateSupplierGroupDto) {}
