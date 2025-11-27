// src/modules/payroll/payroll.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payroll } from './entities/payroll.entity';
import { PayrollSlip } from './entities/payroll-slip.entity';
import { SalarySetting } from './entities/salary-setting.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { SalarySettingController } from './salary-setting.controller';

import { CashbookEntry } from '@modules/cashbook/entities/cashbook.entity';
import { CashType } from '@modules/cashbook/entities/cash_types.entity';
import { CashOtherParty } from '@modules/cashbook/entities/cash_other_party';
import { CashbookService } from '@modules/cashbook/cashbook.service';

import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';
import { User } from '@modules/user/entities/user.entity';
import { Customer } from '@modules/customers/entities/customers.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // payroll
      Payroll,
      PayrollSlip,
      SalarySetting,
      // cashbook + liên quan
      CashbookEntry,
      CashType,
      Invoice,
      PurchaseReceipt,
      PurchaseReturn,
      Customer,
      Supplier,
      CashOtherParty,
      User,
    ]),
  ],
  controllers: [PayrollController, SalarySettingController],
  providers: [PayrollService, CashbookService],
  exports: [PayrollService],
})
export class PayrollModule { }
