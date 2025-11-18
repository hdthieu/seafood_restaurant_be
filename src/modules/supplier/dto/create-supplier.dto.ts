// create-supplier.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
} from 'class-validator';
import { SupplierStatus } from 'src/common/enums';

export class CreateSupplierDto {
    @ApiProperty({ example: 'Công ty TNHH ABC', maxLength: 50 })
    @IsString()
    @Length(1, 50, { message: 'Tên nhà cung cấp phải từ 1–50 ký tự' })
    name!: string;

    @ApiPropertyOptional({ example: 'ABC Group' })
    @IsOptional()
    @IsString()
    @Length(1, 100)
    company?: string;

    @ApiPropertyOptional({ example: '1234567890' })
    @IsOptional()
    @IsString()
    @Length(1, 20)
    taxCode?: string;

    @ApiPropertyOptional({ example: '0905123456' })
    @IsOptional()
    @IsString()
    @Matches(/^(0|\+84)[0-9]{9,10}$/, {
        message: 'Số điện thoại không hợp lệ (bắt đầu 0 hoặc +84, 10–11 số)',
    })
    phone?: string;

    @ApiPropertyOptional({ example: 'abc@gmail.com' })
    @IsOptional()
    @IsEmail({}, { message: 'Email không hợp lệ' })
    email?: string;

    @ApiPropertyOptional({ example: '123 Nguyễn Trãi, Q.1' })
    @IsOptional()
    @IsString()
    @Length(0, 255)
    address?: string;

    @ApiPropertyOptional({ example: 'Hồ Chí Minh' })
    @IsOptional()
    @IsString()
    @Length(0, 100)
    city?: string;

    @ApiPropertyOptional({ example: 'Quận 1' })
    @IsOptional()
    @IsString()
    @Length(0, 100)
    district?: string;

    @ApiPropertyOptional({ example: 'Phường Bến Nghé' })
    @IsOptional()
    @IsString()
    @Length(0, 100)
    ward?: string;

    @ApiPropertyOptional({
        example: '2f3a8e47-9c45-4a11-9e9f-2a42e46adabc',
        description: 'ID nhóm nhà cung cấp',
    })
    @IsOptional()
    @IsUUID('4', { message: 'supplierGroupId phải là UUID v4' })
    supplierGroupId?: string;

    @ApiPropertyOptional({ example: 'Nhà cung cấp uy tín' })
    @IsOptional()
    @IsString()
    @Length(0, 255)
    note?: string;

    @ApiPropertyOptional({ enum: SupplierStatus, default: SupplierStatus.ACTIVE })
    @IsOptional()
    @IsEnum(SupplierStatus)
    status?: SupplierStatus;
}
