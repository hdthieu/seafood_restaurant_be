import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListCashTypeDto {
    @ApiProperty({ required: false, description: 'Từ khóa tìm kiếm theo tên hoặc mô tả' })
    @IsOptional()
    @IsString()
    q?: string;

    @ApiProperty({ required: false, description: 'Lọc theo loại thu (true) hay chi (false)' })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    @IsBoolean()
    isIncomeType?: boolean;

    @ApiProperty({ required: false, description: 'Lọc theo trạng thái hoạt động' })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({ required: false, default: 1, description: 'Số trang' })
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || 1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 20, description: 'Số bản ghi trên trang' })
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || 20)
    limit?: number = 20;
}