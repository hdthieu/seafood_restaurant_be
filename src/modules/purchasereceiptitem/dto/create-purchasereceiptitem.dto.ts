import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from 'src/common/enums';

export class CreatePurchaseReceiptItemDto {
    @ApiProperty({ example: 'inventory-item-uuid' })
    @IsUUID() itemId: string;
  
    @ApiProperty({ example: 10 })
    @Type(() => Number) @IsNumber() @Min(0.001)
    quantity: number;
  
    @ApiProperty({ example: 50000 })
    @Type(() => Number) @IsNumber() @Min(0)
    unitPrice: number;
  
    @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.AMOUNT })
    @IsEnum(DiscountType) @IsOptional()
    discountType?: DiscountType = DiscountType.AMOUNT;
  
    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    discountValue?: number = 0;
  
    // GỬI CODE UOM (vd: 'KG', 'CASE24'). Nếu không gửi, mặc định baseUom của item.
    @ApiPropertyOptional({ example: 'KG' })
    @IsString() @IsOptional()
    receivedUomCode?: string;
  
    // Cho phép override hệ số theo lô (optional). Nếu không gửi, BE tra từ UomConversion.
    @Type(() => Number) @IsNumber() @Min(0.000001) @IsOptional()
    conversionToBase?: number;
  
    @ApiPropertyOptional({ example: 'LOT-2025-09' })
    @IsOptional() lotNumber?: string;
  
    @ApiPropertyOptional({ example: '2025-09-30' })
    @IsOptional() @IsDateString()
    expiryDate?: string;
  
    @ApiPropertyOptional({ example: 'Ghi chú item' })
    @IsOptional() note?: string;
  }
  
