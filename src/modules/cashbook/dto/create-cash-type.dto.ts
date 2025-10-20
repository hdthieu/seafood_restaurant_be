import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateCashTypeDto {
    @ApiProperty({ description: 'Tên loại thu chi', example: 'Tiền mặt' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Là loại thu (true) hay loại chi (false)',
        example: true,
        default: true
    })
    @IsBoolean()
    @IsOptional()
    isIncomeType?: boolean = true;

    @ApiProperty({
        description: 'Mô tả loại thu chi',
        example: 'Thanh toán bằng tiền mặt',
        required: false
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'Trạng thái hoạt động',
        example: true,
        default: true
    })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean = true;
}