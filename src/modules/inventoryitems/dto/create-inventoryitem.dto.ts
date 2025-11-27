import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';


export class CreateInventoryitemDto {
    @ApiProperty({ example: 'Tôm sú' })
    @IsString()
    @IsNotEmpty()
    name: string;

    // Mã đơn vị cơ bản (trùng UnitsOfMeasure.code), ví dụ: 'KG', 'G', 'L', 'ML', 'EA'
    @ApiProperty({ example: 'KG', description: 'Mã UOM cơ bản (UnitsOfMeasure.code)' })
    @IsString()
    @IsNotEmpty()
    unit: string;

    @ApiProperty({ example: 0, description: 'Ngưỡng cảnh báo tồn (>= 0)', default: 0, required: false })
    @IsOptional()
    @Transform(({ value }) =>
        value === '' || value === undefined || value === null ? 0 : Number(value),
    )
    @IsNumber()
    @Min(0)
    alertThreshold: number = 0;

    @ApiProperty({ required: false, example: 'Tôm loại 1, tươi sống' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false, example: '677efe87-f972-4021-804d-8eec6c1f7bdd', description: 'Category Id (tuỳ chọn) để gán nguyên liệu vào nhóm' })
    @IsOptional()
    @IsUUID()
    categoryId?: string;
}