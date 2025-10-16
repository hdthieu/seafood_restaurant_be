import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoicesService } from './invoice.service';
import { InvoicesController } from './invoice.controller';
import { Order } from 'src/modules/order/entities/order.entity';

import { Payment } from 'src/modules/payments/entities/payment.entity';
import { CashbookModule } from '@modules/cashbook/cashbook.module';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, Order,Payment]), CashbookModule],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService, TypeOrmModule],
})
export class InvoiceModule {}
