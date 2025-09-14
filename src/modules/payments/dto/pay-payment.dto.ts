// src/modules/invoice/dto/add-payment.dto.ts
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from 'src/common/enums';

export class AddPaymentDto {
  @IsNumber()
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  note?: string;
}
