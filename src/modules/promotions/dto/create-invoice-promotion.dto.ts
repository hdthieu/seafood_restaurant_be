// src/modules/invoice-promotion/dto/create-invoice-promotion.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ApplyWith } from 'src/common/enums';

export class CreateInvoicePromotionDto {
  @ApiProperty({ example: 'b6b2f9e0-1e96-4e4d-9c8a-27fe2b6e0aa1' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ example: '3c38e8d0-02a4-44f0-9d70-5e0e2d4e7c0b' })
  @IsUUID()
  promotionId!: string;

  @ApiProperty({ enum: ApplyWith, example: ApplyWith.ORDER })
  @IsEnum(ApplyWith)
  applyWith!: ApplyWith;

  @ApiProperty({
    example: 250000,
    description: 'Nền tính giảm cho KM tại thời điểm áp dụng (ví dụ: tổng bill hoặc tổng category đã lọc)'
  })
  @IsNumber()
  @Min(0)
  calculationBase!: number;

  @ApiPropertyOptional({ example: 0, description: 'Số quà tặng (nếu KM dạng GIFT) — tùy hệ thống' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  giftsCount?: number;
}
