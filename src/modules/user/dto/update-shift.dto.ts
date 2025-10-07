// src/modules/shift/dto/update-shift.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateShiftDto } from './create-shift.dto';

export class UpdateShiftDto extends PartialType(CreateShiftDto) {}
