import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ComboComponentDto {
    @ApiProperty({
        description: 'ID món lẻ nằm trong combo',
        example: '3e0f3b3d-6f9f-4a9a-9a3c-0b7d6e5d1234',
    })
    @IsString()
    @IsNotEmpty()
    itemId: string;

    @ApiProperty({
        description: 'Số lượng món con trong combo',
        example: 1,
        minimum: 0.001,
    })
    @IsNumber()
    @IsPositive()
    quantity: number;
}
