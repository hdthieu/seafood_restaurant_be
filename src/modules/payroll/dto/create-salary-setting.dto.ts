// src/modules/payroll/dto/create-salary-setting.dto.ts
import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsUUID } from 'class-validator';
import { SalaryType } from 'src/common/enums';

export class CreateSalarySettingDto {
  @IsUUID()
  staffId: string;

  @IsEnum(SalaryType)
  salaryType: SalaryType;

  // lương theo ca / giờ / kỳ
  @IsNumberString()
  baseAmount: string;

  @IsOptional()
  @IsNumberString()
  overtimeRate?: string;
}
