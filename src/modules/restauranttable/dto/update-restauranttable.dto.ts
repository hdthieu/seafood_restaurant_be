import { PartialType } from '@nestjs/swagger';
import { CreateRestauranttableDto } from './create-restauranttable.dto';

export class UpdateRestauranttableDto extends PartialType(CreateRestauranttableDto) {}
