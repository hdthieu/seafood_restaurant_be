import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class StandaloneLineDto {
    @ApiProperty({ example: 'uuid-of-item' })
    @IsNotEmpty()
    @IsString()
    itemId: string;

    @ApiProperty({ example: 10 })
    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    quantity: number; // quantity in base UOM

    @ApiProperty({ example: 15000, required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    unitPrice?: number;

    @ApiProperty({ example: 'LOT001', required: false })
    @IsOptional()
    @IsString()
    lotNumber?: string;
}

export class StandaloneReturnDto {
    @ApiProperty({ example: 'uuid-of-supplier' })
    @IsNotEmpty()
    @IsString()
    supplierId: string;

    @ApiProperty({ type: [StandaloneLineDto] })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => StandaloneLineDto)
    items: StandaloneLineDto[];

    @ApiProperty({ example: 'Hàng hỏng/không đạt' })
    @IsNotEmpty()
    @IsString()
    reason: string;

    @ApiProperty({ example: 'idempotency-key-123', required: false })
    @IsOptional()
    @IsString()
    idempotencyKey?: string;
}
