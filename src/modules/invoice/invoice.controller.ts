// src/modules/invoice/invoice.controller.ts
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { InvoicesService } from './invoice.service';
import { PaymentMethod } from 'src/common/enums';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Post('from-order/:orderId')
  createFromOrder(@Param('orderId', new ParseUUIDPipe()) orderId: string) {
    return this.svc.createFromOrder(orderId);
  }

  @Post(':id/payments')
  addPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: { amount: number; method?: PaymentMethod },
  ) {
    return this.svc.addPayment(id, { amount: dto.amount, method: dto.method ?? PaymentMethod.CASH });
  }

  @Patch(':id/mark-paid')
  markPaid(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.markPaid(id);
  }
}
