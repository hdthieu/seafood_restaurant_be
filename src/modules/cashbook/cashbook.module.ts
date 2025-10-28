import { Module } from '@nestjs/common';
import { CashbookService } from './cashbook.service';
import { CashbookController } from './cashbook.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashType } from './entities/cash_types.entity';
import { CashbookEntry } from './entities/cashbook.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { CashOtherParty } from './entities/cash_other_party';
import { Customer } from '@modules/customers/entities/customers.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { User } from '@modules/user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Supplier, CashOtherParty, CashType, CashbookEntry, PurchaseReceipt, Invoice, User])],
  controllers: [CashbookController],
  providers: [CashbookService],
  exports: [CashbookService],
})
export class CashbookModule { }
