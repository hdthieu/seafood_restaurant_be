import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { CashbookType, CounterpartyGroup } from 'src/common/enums';

export class CreateCashbookEntryDto {
    @ApiProperty({ enum: CashbookType })
    @IsEnum(CashbookType)
    type: CashbookType; // RECEIPT | PAYMENT

    @ApiProperty({ type: String, description: 'ISO date string' })
    @IsString()
    date: string;

    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    cashTypeId: string;

    @ApiProperty({ type: String, description: 'e.g. "1000.00"' })
    @IsNumberString()
    amount: string;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    isPostedToBusinessResult?: boolean = true;

    @ApiProperty({ enum: CounterpartyGroup })
    @IsEnum(CounterpartyGroup)
    counterpartyGroup: CounterpartyGroup;

    // ---- IDs theo nhóm ----
    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf(o => o.counterpartyGroup === CounterpartyGroup.CUSTOMER)
    @IsUUID()
    @IsOptional()
    customerId?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf(o => o.counterpartyGroup === CounterpartyGroup.SUPPLIER)
    @IsUUID()
    @IsOptional()
    supplierId?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf(o => o.counterpartyGroup === CounterpartyGroup.OTHER)
    @IsUUID()
    @IsOptional()
    cashOtherPartyId?: string;

    // Cho phép tạo nhanh OtherParty nếu chưa có ID
    @ApiPropertyOptional({ description: 'Only used when group = OTHER' })
    @ValidateIf(o => o.counterpartyGroup === CounterpartyGroup.OTHER && !o.cashOtherPartyId)
    @IsString()
    @IsOptional()
    counterpartyName?: string;

    // ---- Liên kết nguồn (chỉ 1) ----
    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf(o => !o.purchaseReceiptId)
    @IsUUID()
    @IsOptional()
    invoiceId?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf(o => !o.invoiceId)
    @IsUUID()
    @IsOptional()
    purchaseReceiptId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    sourceCode?: string;
}
