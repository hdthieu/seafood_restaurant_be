import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsString } from 'class-validator';
import { BaseRangeDto } from './base-range.dto';

// Query dto cho báo cáo bán hàng theo khách hàng và hàng bán theo khách
export class CustomerSalesQueryDto extends BaseRangeDto {
    @ApiPropertyOptional({ description: 'Filter theo khách (customer id)' })
    @IsOptional() @IsUUID()
    customerId?: string;

    @ApiPropertyOptional({ description: 'Tìm khách theo mã / tên / điện thoại' })
    @IsOptional() @IsString()
    customerQ?: string;
}
