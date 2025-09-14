import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    Length,
} from 'class-validator';
import { SupplierStatus } from 'src/common/enums';

export class CreateSupplierDto {
    @ApiProperty({ example: 'Công ty TNHH ABC', maxLength: 50 })
    @IsString()
    @Length(1, 50)
    name!: string;

    @ApiPropertyOptional({ example: 'SUP-001', maxLength: 32 })
    @IsOptional()
    @IsString()
    @Length(1, 32)
    code?: string;

    @ApiPropertyOptional({ example: 'ABC Group' })
    @IsOptional()
    @IsString()
    company?: string;

    @ApiPropertyOptional({ example: '1234567890' })
    @IsOptional()
    @IsString()
    taxCode?: string;

    @ApiPropertyOptional({ example: '0905123456' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ example: 'abc@gmail.com' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: '123 Nguyễn Trãi, Q.1' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ example: 'Hồ Chí Minh' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ example: 'Quận 1' })
    @IsOptional()
    @IsString()
    district?: string;

    @ApiPropertyOptional({ example: 'Phường Bến Nghé' })
    @IsOptional()
    @IsString()
    ward?: string;

    /** 🔹 Thay supplierGroup:string bằng supplierGroupId:uuid */
    @ApiPropertyOptional({
        example: '2f3a8e47-9c45-4a11-9e9f-2a42e46adabc',
        description: 'ID nhóm nhà cung cấp',
    })
    @IsOptional()
    @IsUUID()
    supplierGroupId?: string;

    @ApiPropertyOptional({ example: 'Nhà cung cấp uy tín' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({ enum: SupplierStatus, default: SupplierStatus.ACTIVE })
    @IsOptional()
    @IsEnum(SupplierStatus)
    status?: SupplierStatus;
}
