// src/modules/payments/payment.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentService } from './payments.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  /** Thanh toán tiền mặt demo */
  @Post('manual')
  async createManual(@Body() dto: { invoiceId: string; amount: number }) {
    return this.svc.createManual(dto);
  }

  /** Tạo URL VNPay */
  @Post('vnpay/create')
  async createVNPay(
    @Body() dto: { invoiceId: string; amount?: number; bankCode?: string },
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.socket?.remoteAddress as string) ||
      '127.0.0.1';

    return this.svc.createVNPayUrl({ ...dto, ipAddress: ip });
  }

  /** Return (browser redirect): verify checksum và redirect về FE */
  @Get('vnpay/return')
async vnpReturn(@Query() q: any, @Res() res: Response) {
  // thử đánh PAID ngay khi RETURN=00 (không chờ IPN)
  try { await this.svc.tryMarkPaidFromReturn(q); } catch {}

  const r = await this.svc.handleVnpReturn(q);
  const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/+$/,'');
  const status = r.ok && r.code === '00' ? 'success' : 'fail';

  const params = new URLSearchParams({
    status,
    invoiceId: r.invoiceId || '',
    txnRef: String(q.vnp_TxnRef || ''),
    amount: String(Number(q.vnp_Amount || 0) / 100),
    bankCode: q.vnp_BankCode || '',
    code: r.code || '',
  });

  const target =
    status === 'success'
      ? `${FRONTEND_URL}/checkout/success?${params.toString()}`
      : `${FRONTEND_URL}/checkout/fail?${params.toString()}`;

  return res.redirect(target);
}

  /** IPN (server-to-server) */
  @Get('vnpay/ipn')
  async vnpIpn(@Query() q: any) {
    return this.svc.handleVnpIpn(q);
  }

  /** FE poll trạng thái */
  @Get('vnpay/status')
  async getStatus(@Query('txnRef') txnRef: string) {
    if (!txnRef) return { status: 'INVALID', message: 'Missing txnRef' };
    return this.svc.getStatusByTxnRef(txnRef);
  }
}
