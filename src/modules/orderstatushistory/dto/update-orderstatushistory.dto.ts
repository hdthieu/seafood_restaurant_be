import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderstatushistoryDto } from './create-orderstatushistory.dto';

export class UpdateOrderstatushistoryDto extends PartialType(CreateOrderstatushistoryDto) {}
