// src/modules/customers/dtos/customers-filter.dto.ts
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CustomerType, Gender } from 'src/common/enums';

export class CustomersFilterDto {
  @IsOptional() @IsString()
  q?: string; // mã / tên / phone / email

  @IsOptional() @IsEnum(CustomerType)
  type?: CustomerType; // PERSONAL | COMPANY

  @IsOptional() @IsEnum(Gender)
  gender?: Gender; // MALE | FEMALE | OTHER

  // YYYY-MM-DD
  @IsOptional() @IsString() createdFrom?: string;
  @IsOptional() @IsString() createdTo?: string;

  @IsOptional() @IsString() birthdayFrom?: string;
  @IsOptional() @IsString() birthdayTo?: string;

  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() ward?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional() @IsInt() @Min(1)
  page?: number = 1;

  @Transform(({ value }) => Number(value))
  @IsOptional() @IsInt() @Min(1)
  limit?: number = 20;
}
