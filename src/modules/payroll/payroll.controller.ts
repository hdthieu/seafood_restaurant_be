// src/modules/payroll/payroll.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { ListPayrollDto } from './dto/list-payroll.dto';
import { PayPayrollDto } from './dto/pay-payroll.dto';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
@Controller('payrolls')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  list(@Query() q: ListPayrollDto) {
    return this.payrollService.listPayrolls(q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.payrollService.getPayrollDetail(id);
  }

  @Post()
  create(@Body() dto: CreatePayrollDto) {
    return this.payrollService.createPayroll(dto);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body() dto: PayPayrollDto) {
    return this.payrollService.payPayroll(id, dto);
  }
}
