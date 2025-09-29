// src/modules/inventoryitems/dto/item-uom-option.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ItemUomOptionDto {
    @ApiProperty({ example: 'CASE24' }) 
    code: string;
    @ApiProperty({ example: 'Thùng 24 lon' }) 
    name: string;
    @ApiProperty({ example: 24, description: '1 received = conversionToBase * base' })
    conversionToBase: number;
    @ApiProperty({ example: false }) 
    isBase: boolean;
    @ApiProperty({ example: 'CASE24 (x24 CAN)' }) 
    label: string;
}
