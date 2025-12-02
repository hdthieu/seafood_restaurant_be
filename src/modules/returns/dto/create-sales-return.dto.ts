import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { RefundMethod } from "src/common/enums";

class ReturnItemDto {
  @IsUUID()
  orderItemId: string;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateSalesReturnDto {
  @IsUUID()
  invoiceId: string;

  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @IsEnum(RefundMethod)
  refundMethod: RefundMethod;

  @IsOptional()
  @IsString()
  note?: string;
}
