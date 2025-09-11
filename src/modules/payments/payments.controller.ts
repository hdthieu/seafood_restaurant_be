// src/modules/payments/payment.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { PaymentService } from './payments.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  @Post('manual')
  createManual(@Body() dto: { invoiceId: string; amount: number }) {
    return this.svc.createManual({ ...dto, status: 'SUCCESS' });
  }
}
