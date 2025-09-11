import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVNPayPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  returnUrl?: string; // Nếu muốn override env
}
