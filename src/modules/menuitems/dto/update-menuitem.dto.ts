import { PartialType } from '@nestjs/mapped-types';
import { CreateMenuitemDto } from './create-menuitem.dto';

export class UpdateMenuitemDto extends PartialType(CreateMenuitemDto) {}
