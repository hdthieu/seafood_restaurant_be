// dto/upsert-salary-setting.dto.ts

import { SalaryType } from "src/common/enums";
import { SalaryMeta } from "../entities/salary-setting.entity";


export class UpsertSalarySettingDto {
  staffId: string;
  salaryType: SalaryType;
  baseAmount: string;
  overtimeRate?: string;

  meta?: SalaryMeta;
}
