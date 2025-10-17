// src/modules/cashbook/dto/list-cashbook-entry.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CashbookType, CounterpartyGroup } from 'src/common/enums';


export class ListCashbookEntryDto {
    @ApiPropertyOptional() @IsOptional() @IsString()
    q?: string; // tìm theo code / sourceCode / counterpartyName

    @ApiPropertyOptional({ enum: CashbookType })
    @IsOptional() @IsEnum(CashbookType)
    type?: CashbookType;

    @ApiPropertyOptional({ enum: CounterpartyGroup })
    @IsOptional() @IsEnum(CounterpartyGroup)
    counterpartyGroup?: CounterpartyGroup;

    @ApiPropertyOptional() @IsOptional() @IsUUID()
    cashTypeId?: string;

    @ApiPropertyOptional() @IsOptional() @IsBoolean()
    @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
    isPostedToBusinessResult?: boolean;

    @ApiPropertyOptional() @IsOptional() @IsString()
    dateFrom?: string; // ISO date

    @ApiPropertyOptional() @IsOptional() @IsString()
    dateTo?: string;   // ISO date

    @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1)
    @Transform(({ value }) => Number(value ?? 1))
    page?: number = 1;

    @ApiPropertyOptional({ default: 15 }) @IsOptional() @IsInt() @Min(1) @Max(100)
    @Transform(({ value }) => Number(value ?? 15))
    limit?: number = 15;

    @ApiPropertyOptional({ default: 'date' }) @IsOptional() @IsString()
    sortBy?: 'date' | 'createdAt' | 'code' = 'date';

    @ApiPropertyOptional({ default: 'DESC' }) @IsOptional() @IsString()
    sortDir?: 'ASC' | 'DESC' = 'DESC';
}
