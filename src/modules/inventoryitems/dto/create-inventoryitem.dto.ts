import { ApiProperty } from "@nestjs/swagger";

export class CreateInventoryitemDto {
    @ApiProperty({ example: 'Tôm sú' })
    name: string;

    @ApiProperty({ example: 'kg' })
    unit: string;

    @ApiProperty({ example: 10 })
    quantity: number;

    @ApiProperty({ example: 2 })
    alertThreshold: number;

    @ApiProperty({ required: false, example: 'Tôm loại 1, tươi sống' })
    description?: string;
}
