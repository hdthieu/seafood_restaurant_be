// src/modules/invoice/invoice.controller.ts
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoice.service';
import { PaymentMethod } from 'src/common/enums';
import { Query, Get } from '@nestjs/common';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import {CurrentUser} from 'src/common/decorators/user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Post('from-order/:orderId')
  createFromOrder(
    @Param('orderId') orderId: string,
    @Body() body: { guestCount?: number; customerId?: string | null },
    @CurrentUser() user: any
  ) {
  return this.svc.createFromOrder(orderId, body, user.id);
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

  @Get()
  list(@Query() q: QueryInvoicesDto) {
    return this.svc.list(q);
  }

  /** ========== DETAIL (FE: GET /invoices/:id) ========== */
  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.detail(id);
  }

}
