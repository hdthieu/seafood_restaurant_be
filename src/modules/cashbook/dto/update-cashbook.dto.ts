import { PartialType } from '@nestjs/swagger';
import { CreateCashbookEntryDto } from './create-cashbook.dto';

export class UpdateCashbookDto extends PartialType(CreateCashbookEntryDto) { }
