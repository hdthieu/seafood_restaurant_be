// src/modules/purchasereceipt/dto/pay-receipt.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class PayReceiptDto {
    @ApiProperty({ example: 500000 })
    @Type(() => Number)
    @IsNumber()
    @Min(0.01)
    addAmountPaid: number;
}
