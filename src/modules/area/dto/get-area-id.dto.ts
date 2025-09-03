// src/modules/area/dto/get-area-id.dto.ts

import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetAreaIdDto {
    @ApiProperty({ example: 'Lầu 2', description: 'Tên khu vực' })
    @IsNotEmpty({ message: 'Tên khu vực không được để trống' })
    name: string;
}
