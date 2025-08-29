import { PartialType } from '@nestjs/mapped-types';
import { CreateMenuitemingredientDto } from './create-menuitemingredient.dto';

export class UpdateMenuitemingredientDto extends PartialType(CreateMenuitemingredientDto) {}
