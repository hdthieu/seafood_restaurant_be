import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { CreateCashTypeDto } from './create-cash-type.dto';

export class UpdateCashTypeDto extends PartialType(CreateCashTypeDto) { }