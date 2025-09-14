import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { SupplierStatus } from "src/common/enums";

export class CreateSupplierGroupDto {
    @ApiPropertyOptional({ example: 'SG-001', maxLength: 50 })
    @IsString()
    @MaxLength(50)
    code: string;

    @ApiPropertyOptional({ example: 'Nhóm cung cấp rau', maxLength: 100 })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ example: 'Nhóm cung cấp rau củ quả tươi sạch', maxLength: 255 })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @ApiPropertyOptional({ enum: SupplierStatus, default: SupplierStatus.ACTIVE })
    @IsOptional()
    @IsEnum(SupplierStatus)
    status?: SupplierStatus;
}