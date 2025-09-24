import { PartialType } from '@nestjs/swagger';
import { CreateUnitsOfMeasureDto } from './create-units-of-measure.dto';

export class UpdateUnitsOfMeasureDto extends PartialType(CreateUnitsOfMeasureDto) {}
