import { IsIP, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateVNPayDto {
  @IsString()
  invoiceId!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  bankCode?: string; // 'VNBANK' | 'INTCARD' | 'VNPAYQR' | '<shortBank>'

  @IsIP()
  ipAddress!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  expireInMinutes?: number; // default 15
}
