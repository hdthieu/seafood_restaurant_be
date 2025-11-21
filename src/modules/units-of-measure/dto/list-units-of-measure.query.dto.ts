import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsString, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListUnitsOfMeasureQueryDto {
    @ApiProperty({ required: false, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 1 : Number(value))
    page?: number = 1;

    @ApiProperty({ required: false, example: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Transform(({ value }) => value === undefined || value === '' ? 20 : Number(value))
    limit?: number = 20;

    @ApiProperty({ required: false, description: 'Tìm theo code chính xác' })
    @IsOptional()
    @IsString()
    code?: string;

    @ApiProperty({ required: false, description: 'Tìm theo tên (chứa chuỗi)' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ required: false, enum: ['mass', 'volume', 'count', 'length'] })
    @IsOptional()
    @IsIn(['mass', 'volume', 'count', 'length'])
    dimension?: 'mass' | 'volume' | 'count' | 'length';

    @ApiProperty({ required: false, description: 'Tìm kiếm chung code hoặc name (ILIKE)' })
    @IsOptional()
    @IsString()
    q?: string;

    @ApiProperty({ required: false, example: 'code', description: 'Field sắp xếp (code|name|dimension)' })
    @IsOptional()
    @IsIn(['code', 'name', 'dimension'])
    sortBy?: 'code' | 'name' | 'dimension';

    @ApiProperty({ required: false, example: 'ASC', description: 'Chiều sắp xếp ASC|DESC' })
    @IsOptional()
    @IsIn(['ASC', 'DESC', 'asc', 'desc'])
    sortDir?: 'ASC' | 'DESC' | 'asc' | 'desc';

    @ApiProperty({ required: false, example: true, description: 'Lọc theo trạng thái active' })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return undefined;
    })
    isActive?: boolean;
}