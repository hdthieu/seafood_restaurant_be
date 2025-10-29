import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PurchaseReturnStatus } from 'src/common/enums';

export class ChangeStatusDto {
    @ApiProperty({ enum: PurchaseReturnStatus })
    @IsEnum(PurchaseReturnStatus)
    status: PurchaseReturnStatus;
}
