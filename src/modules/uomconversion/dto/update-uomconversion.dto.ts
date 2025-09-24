import { PartialType } from '@nestjs/swagger';
import { CreateUomconversionDto } from './create-uomconversion.dto';

export class UpdateUomconversionDto extends PartialType(CreateUomconversionDto) {}
