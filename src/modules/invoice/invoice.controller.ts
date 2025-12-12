// src/modules/invoice/invoice.controller.ts
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoice.service';
import { PaymentMethod, UserRole } from 'src/common/enums';
import { Query, Get } from '@nestjs/common';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { CreateFromOrderDto } from './dto/create-from-order.dto';
import { ApplyPromotionsDto } from './dto/apply-promotions.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
@UseGuards(JwtAuthGuard)
@Controller('invoices')
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) { }

  @Post('from-order/:orderId')
  createFromOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any
  ) {
    console.log('Creating invoice from order:', orderId, 'by user:', user.id);
    // Note: service signature is (orderId, body = {}, userId?)
    // pass empty body as second arg and user.id as third so cashier is set
    return this.svc.createFromOrder(orderId, {}, user.id);
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

  @Post(':id/apply-promotions')
  applyPromotions(
    @Param('id') id: string,
    @Body() dto: ApplyPromotionsDto,
  ) {
    return this.svc.applyPromotions(id, dto);
  }

  @Patch(':id/promotions/:ipId/remove')
  removePromotion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ipId', new ParseUUIDPipe()) ipId: string,
  ) {
    return this.svc.removePromotion(id, ipId);
  }

  @Get(':id/applicable-promotions')
  async listApplicable(@Param('id', new ParseUUIDPipe()) id: string) {
    console.log('Listing applicable promotions for invoice:', id);
    const result = await this.svc.listApplicablePromotions(id);
    console.log('list result', result);
    return result;
  }

  // @Get('from-order/:orderId')
  // getByOrder(@Param('orderId') orderId: string) {
  //   return this.svc.getByOrder(orderId);
  // }
}
