import { ApiProperty } from '@nestjs/swagger';

export class PromotionTargetDto {
    @ApiProperty({ enum: ['CATEGORY', 'ITEM', 'TABLE', 'AREA'] })
    type!: 'CATEGORY' | 'ITEM' | 'TABLE' | 'AREA';

    @ApiProperty({ example: 'uuid-category-nuong' })
    id!: string;
}