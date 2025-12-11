import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFromOrderDto {
  @IsOptional()
  @IsUUID('4')
  customerId?: string | null;

  @IsOptional()
  @Type(() => Number)     
  @IsInt()
  @Min(0)
  guestCount?: number | null;
}
