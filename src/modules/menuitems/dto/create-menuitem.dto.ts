import { ApiProperty } from '@nestjs/swagger';

export class CreateMenuItemDto {
    @ApiProperty({ example: 'Lẩu hải sản', description: 'Tên món ăn' })
    name: string;

    @ApiProperty({ example: 250000, description: 'Giá món ăn' })
    price: number;

    @ApiProperty({ example: 'Món lẩu thập cẩm hải sản tươi sống', required: false })
    description?: string;

    @ApiProperty({ example: 'https://example.com/lau.jpg', required: false })
    image?: string;

    @ApiProperty({ example: '9c0a8e3c-0d4f-4b21-b6d7-123456789abc', description: 'ID danh mục món ăn' })
    categoryId: string;

    @ApiProperty({
        type: [Object],
        description: 'Danh sách nguyên liệu',
        example: [
            {
                inventoryItemId: 'a1b2c3d4-e5f6-7890-ghij-klmnopqrstuv',
                quantity: 0.5,
                note: 'Loại tươi sống',
            },
        ],
    })
    ingredients: {
        inventoryItemId: string;
        quantity: number;
        note?: string;
    }[];
}
