import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ReturnLineDto {
    @ApiProperty({ example: 'uuid-of-receipt-item' })
    @IsNotEmpty()
    @IsUUID()
    receiptItemId: string; // IsUUID đã ngụ ý string

    @ApiProperty({ example: 2.5 })
    @IsNotEmpty()
    @Type(() => Number)
    @IsNumber()
    @IsPositive() // > 0
    quantity: number;

    @ApiProperty({ example: 'Hàng hỏng', required: false })
    @IsOptional()
    @IsString()
    reason?: string;
}

export class ReturnReceiptDto {
    @ApiProperty({
        type: [ReturnLineDto],
        example: [{ receiptItemId: 'uuid', quantity: 2.5, reason: 'Hàng hỏng' }]
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ReturnLineDto)
    items: ReturnLineDto[];
    
    @ApiProperty({ example: 10000, required: false })
    @IsOptional() @Type(() => Number) @IsNumber()
    discount?: number;

    @ApiProperty({ example: 'Ghi chú', required: false })
    @IsOptional() @IsString()
    note?: string;
}
