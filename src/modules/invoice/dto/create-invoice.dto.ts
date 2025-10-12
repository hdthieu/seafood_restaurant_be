import { IsNotEmpty, IsNumberString, IsOptional, IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  // Nếu totalAmount của order đã có trong DB, có thể bỏ qua
  @IsOptional()
  @IsNumberString()
  totalAmount?: string; 
}

