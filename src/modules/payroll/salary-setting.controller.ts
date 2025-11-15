// src/modules/payroll/salary-setting.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CreateSalarySettingDto } from './dto/create-salary-setting.dto';

@Controller('salary-settings')
export class SalarySettingController {
  constructor(private readonly payrollService: PayrollService) {}

  // GET /salary-settings/:staffId
  @Get(':staffId')
  getOne(@Param('staffId') staffId: string) {
    return this.payrollService.getSalarySetting(staffId);
  }

  // POST /salary-settings
  @Post()
  upsert(@Body() dto: CreateSalarySettingDto) {
    return this.payrollService.upsertSalarySetting(dto);
  }
}
