import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BaseRangeDto } from './base-range.dto';

export class SalesDailyQueryDto extends BaseRangeDto {
    @ApiPropertyOptional({ description: 'Phương thức thanh toán: TM/CK/POS...' })
    @IsOptional() 
    @IsString() 
    paymentMethod?: string;

    @ApiPropertyOptional({ description: 'Tìm khách hàng theo mã/tên/điện thoại' })
    @IsOptional() 
    @IsString() 
    customerQ?: string;
}
