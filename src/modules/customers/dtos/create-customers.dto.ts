// src/modules/customers/dto/create-customer.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomerType, Gender } from 'src/common/enums';

export class CreateCustomerDto {
  @IsEnum(CustomerType) type: CustomerType;
  @IsString() name: string;

  @IsOptional() @IsString() companyName?: string; // khi type=COMPANY
  @IsOptional() @IsString() code?: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() taxNo?: string;
  @IsOptional() @IsString() identityNo?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() birthday?: string;     // 'YYYY-MM-DD'

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() ward?: string;
}
