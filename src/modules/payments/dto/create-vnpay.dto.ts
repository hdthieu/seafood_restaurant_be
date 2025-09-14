import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIP, IsInt, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
export class CreateVNPayDto {
  @ApiProperty({ example: 'c4e5e8a0-1234-4a7f-9e5b-2b8c2b0d7f11' })
  @IsUUID()
  invoiceId: string;

  @ApiPropertyOptional({ example: 150000, description: 'VND' })
  @IsOptional() @IsInt() @Min(1)
  amount?: number;

  @ApiPropertyOptional({ example: 'NCB' })
  @IsOptional() @IsString()
  bankCode?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional() @IsInt() @Min(1)
  expireInMinutes?: number;
}