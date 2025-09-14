import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentService } from './payments.service';
import { PaymentController } from './payments.controller';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Invoice]), InvoiceModule],
  providers: [PaymentService],
  controllers: [PaymentController],
})
export class PaymentModule {}
