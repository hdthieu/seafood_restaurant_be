import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentService } from './payments.service';
import { PaymentController } from './payments.controller';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { VietQRService } from './vietqr.service';
import {PayOSService} from "./payos.service";

import {PaymentsGateway} from "./payments.gateway";
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Invoice]), InvoiceModule],
  providers: [PaymentService, VietQRService, PaymentsGateway, PayOSService],

  controllers: [PaymentController, ],
})
export class PaymentModule {}
