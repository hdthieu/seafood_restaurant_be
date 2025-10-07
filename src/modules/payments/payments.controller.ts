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
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaymentService } from './payments.service';
import { VietQRService } from './vietqr.service';
import { CreateVNPayDto } from './dto/create-vnpay.dto';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoicesService } from 'src/modules/invoice/invoice.service';
import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import {PaymentsGateway} from "./payments.gateway";
import { Logger } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, InvoiceStatus } from 'src/common/enums';
import { PayOSService } from './payos.service';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { Head } from '@nestjs/common';
@ApiTags('payments')
@Controller('payments')
export class PaymentController {
   private readonly logger = new Logger('Payments');
  constructor(
    private readonly svc: PaymentService,
    private readonly vietqr: VietQRService,
    private readonly invoiceSvc: InvoicesService,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
    private readonly payOS: PayOSService,
     private readonly gateway: PaymentsGateway,  
   
  ) {}

  /* ----------------------------------------------------------------
   * 1) Demo: thanh toán tiền mặt (ghi nhận ngay)
   * ---------------------------------------------------------------- */
  @Post('manual')
  @ApiOperation({ summary: 'Thanh toán tiền mặt (demo)' })
  async createManual(@Body() dto: { invoiceId: string; amount: number }) {
    return this.svc.createManual(dto);
  }

   /* -------------------- VietQR: tạo QR -------------------- */
  @Post('vietqr')
  @ApiOperation({ summary: 'Tạo QR VietQR cho invoice (amount + addInfo)' })
  async createVietQR(@Body() dto: { invoiceId: string; amount?: number }) {
    return this.vietqr.createQr(dto.invoiceId, dto.amount);
  }

  /* -------------------- Poll trạng thái invoice -------------------- */
  @Get('status')
  @ApiOperation({ summary: 'Lấy trạng thái hóa đơn theo invoiceId' })
  async getInvoiceStatus(@Query('invoiceId') invoiceId: string) {
    const inv = await this.invRepo.findOne({ where: { id: invoiceId }, relations: ['payments'] });
    if (!inv) return { status: 'NOT_FOUND' };

    const paid = (inv.payments ?? [])
      .filter((p) => p.status === PaymentStatus.SUCCESS)
      .reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(inv.totalAmount);
    const remaining = Math.max(0, total - paid);

    return { status: inv.status, total, paid, remaining };
  }

  /* -------------------- Mock success (dùng sandbox) -------------------- */
@Post('mock/vietqr-success')
async mockVietQrSuccess(@Body() dto: { invoiceId: string; amount?: number }) {
  const inv = await this.invRepo.findOne({ where: { id: dto.invoiceId }, relations: ['payments'] });
  if (!inv) return { ok: false, message: 'INVOICE_NOT_FOUND' };

  const paid = (inv.payments ?? [])
    .filter((p) => p.status === PaymentStatus.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);

  const remain = Math.max(0, Number(inv.totalAmount) - paid);
  const amount = Math.round(dto.amount ?? remain);
  if (amount <= 0) return { ok: false, message: 'NOTHING_TO_PAY' };

  await this.invoiceSvc.addPayment(inv.id, { amount, method: PaymentMethod.VIETQR });

  // 🔔 emit realtime giống webhook
  const invAfter = await this.invRepo.findOne({ where: { id: inv.id }, relations: ['payments'] });
  const paidAfter = (invAfter?.payments ?? [])
    .filter((p) => p.status === PaymentStatus.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);
  const remainingAfter = Math.max(0, Number(invAfter?.totalAmount || 0) - paidAfter);

  if (invAfter?.status === InvoiceStatus.PAID) {
    this.gateway.emitPaid(inv.id, { invoiceId: inv.id, amount, method: 'VIETQR' });
  } else {
    this.gateway.emitPartial(inv.id, { invoiceId: inv.id, amount, remaining: remainingAfter });
  }
  return { ok: true };
}


  /* -------------------- Webhook thực nhận giao dịch -------------------- */
  /**
   * Nhận payload từ provider (Casso/bank…). Ở đây mình dùng schema "mềm":
   *  - transactions: mảng các giao dịch
   *  - mỗi giao dịch có: id, amount, description (content), when
   *  - chữ ký HMAC nằm trong header "x-signature" (tùy provider)
   *
   * Lưu ý: cần bật "rawBody" cho route này ở main.ts để verify chữ ký.
   */

// payments.controller.ts
@Post('payos/create-link')
async createPayOSLink(@Body() dto: { invoiceId: string; amount: number; buyerName?: string }) {
  const orderCode = Date.now();
  const description = `INV:${dto.invoiceId.slice(0, 12)}`;

  const link = await this.payOS.createPaymentLink({
    orderCode,
    amount: dto.amount,
    description,
    buyerName: dto.buyerName,
  });

  // ✅ Tạo payment ở trạng thái PENDING, KHÔNG cập nhật invoice total/status
  await this.svc.createPendingPayment({
    invoiceId: dto.invoiceId,
    amount: dto.amount,
    method: PaymentMethod.VIETQR,   // hoặc 'PAYOS' nếu bạn tách kênh
    externalTxnId: String(orderCode),
    note: description,
  });

  return link;
}



 @Get('return')
  returnPage(@Query() q: any, @Res() res: Response) {
    // q có thể chứa orderCode/paymentLinkId/status...
    res.type('html').send(`
      <!doctype html><meta charset="utf-8" />
      <title>Thanh toán thành công</title>
      <p>Thanh toán đã ghi nhận. Bạn có thể đóng cửa sổ này.</p>
      <script>
        // Nếu app mobile có deep link thì mở (tùy chọn):
        // location.href = 'mypos://payos/return';
        setTimeout(()=>window.close(), 1500);
      </script>
    `);
  }

  @Get('cancel')
  cancelPage(@Res() res: Response) {
    res.type('html').send(`
      <!doctype html><meta charset="utf-8" />
      <title>Đã hủy thanh toán</title>
      <p>Bạn đã hủy thanh toán. Bạn có thể đóng cửa sổ này.</p>
    `);
  }
@Get('payos/return')
async payosReturn(@Query() q: any, @Res() res: Response) {
  // q có thể gồm: code/status/orderCode/paymentLinkId/...
  const ok = String(q?.code || q?.status) === '00' || String(q?.status) === 'PAID';
  const FRONTEND = process.env.FRONTEND_URL!.replace(/\/+$/, '');
  const target = `${FRONTEND}/checkout/success?ok=${ok ? 1 : 0}&orderCode=${q?.orderCode || ''}&plink=${q?.paymentLinkId || ''}`;
  return res.redirect(target);
}
@Get('payos/webhook')
@Head('payos/webhook')
@HttpCode(HttpStatus.OK)
pingPayOSWebhook() {
  return { ok: true };
}
@Post('payos/webhook')
@HttpCode(HttpStatus.OK)
async payosWebhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: any) {
  this.logger.log(`[PayOS] webhook HIT ip=${(req as any).ip} ua=${req.headers['user-agent']}`);
  this.logger.log(`[PayOS] headers: ${JSON.stringify(req.headers)}`);
  this.logger.log(`[PayOS] has rawBody=${!!req.rawBody}, len=${req.rawBody?.length}`);

  const raw = req.rawBody?.toString?.() ?? JSON.stringify(body);
  const headerSig =
    (req.headers['x-signature'] as string | undefined) ||
    (req.headers['x-payos-signature'] as string | undefined);

  // ✅ dùng hàm linh hoạt
  if (!this.svc.verifyPayOSSignatureFlexible(raw, body, headerSig)) {
    this.logger.warn('[PayOS] INVALID_SIGNATURE (header/body đều không khớp)');
    // DEBUG: cho qua để test luồng, khi ổn thì bật lại chặn
    // return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  const data = body?.data || body;
  const orderCode = Number(data?.orderCode);
  const amount = Math.round(Number(data?.amount ?? 0));
  const desc: string = String(data?.description ?? '');

  if (!orderCode || !amount) return { ok: true };

  // 1) tìm payment pending theo orderCode
  let payment = await this.svc.findPendingPaymentByOrderCode(orderCode);
  let invoiceId = payment?.invoiceId;

  // 2) fallback từ description (PayOS có thể strip dấu ':', regex đã cho phép không có ':')
  if (!invoiceId && desc) {
    const m = desc.match(/INV[:\s-]?([a-f0-9-]{8,64})/i);
    if (m) {
      const captured = m[1];
      const normalized = captured.toLowerCase().replace(/[^a-f0-9]/g, '');
      const invByReplace = await this.invRepo
        .createQueryBuilder('i')
        .leftJoinAndSelect('i.payments', 'p')
        .where("REPLACE(i.id,'-','') = :cid", { cid: normalized })
        .getOne();
      invoiceId = invByReplace?.id ?? captured;
    }
  }
  if (!invoiceId) {
    this.logger.warn(`PayOS webhook: INVOICE_NOT_FOUND orderCode=${orderCode} desc=${desc}`);
    return { ok: true };
  }

  // 3) lấy invoice + số còn thiếu
  const inv = await this.invRepo.findOne({ where: { id: invoiceId }, relations: ['payments'] });
  if (!inv) return { ok: true };

  const paid = (inv.payments ?? [])
    .filter(p => p.status === PaymentStatus.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);

  const total = Number(inv.totalAmount);
  const remaining = Math.max(0, total - paid);

  // Nếu giữ chặt đúng số còn lại:
  const TOL = 2;
  if (Math.abs(amount - remaining) > TOL) {
    this.logger.warn(`PayOS webhook: AMOUNT_MISMATCH amount=${amount} remaining=${remaining} invoiceId=${invoiceId}`);
    return { ok: true };
  }

  // 4) Ghi nhận tiền + mark pending success
  await this.invoiceSvc.addPayment(invoiceId, {
  amount,
  method: PaymentMethod.VIETQR, // hoặc VNPAY nếu bạn gom nhóm “bank”
  externalTxnId: String(data?.transactionId ?? data?.reference ?? orderCode),
  note: desc,
});
  await this.svc.markPaymentSuccessByOrderCode(orderCode, {
    transactionId: data?.transactionId ?? data?.reference,
  });

  // 5) Bắn socket
  const invAfter = await this.invRepo.findOne({ where: { id: invoiceId }, relations: ['payments'] });
  const paidAfter = (invAfter?.payments ?? [])
    .filter(p => p.status === PaymentStatus.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);
  const remainingAfter = Math.max(0, Number(invAfter?.totalAmount || 0) - paidAfter);

  if (invAfter?.status === InvoiceStatus.PAID) {
    this.gateway.emitPaid(invoiceId, { invoiceId, amount, method: 'PAYOS' });
  } else {
    this.gateway.emitPartial(invoiceId, { invoiceId, amount, remaining: remainingAfter });
  }

  return { ok: true };
}


  /* ----------------------------------------------------------------
   * 3) VNPay: create URL, return redirect, IPN, polling theo txnRef
   * ---------------------------------------------------------------- */

  /** Tạo URL thanh toán VNPay */
 @Post('vnpay/create')
async createVNPay(@Body() dto: { orderId?: string; invoiceId?: string; amount?: number; bankCode?: string }, @Req() req: Request) {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.socket?.remoteAddress as string) ||
    '127.0.0.1';

  // ✅ Bổ sung: nếu chưa có invoiceId mà có orderId -> tạo (idempotent)
  let invoiceId = dto.invoiceId;
  if (!invoiceId && dto.orderId) {
    const inv = await this.invoiceSvc.createFromOrder(dto.orderId);
    invoiceId = inv.id;
  }
  if (!invoiceId) {
    throw new BadRequestException('MISSING_INVOICE_OR_ORDER');
  }

  // gọi service tạo URL với invoiceId đã chắc chắn tồn tại
  return this.svc.createVNPayUrl({ invoiceId, amount: dto.amount, bankCode: dto.bankCode, ipAddress: ip });
}


  /** Browser return: verify checksum & redirect về FE (success/fail) */
  @Get('vnpay/return')
  @ApiOperation({ summary: 'VNPay return (browser redirect)' })
  async vnpReturn(@Query() q: any, @Res() res: Response) {
    // tùy chọn: đánh dấu PAID ngay ở bước return nếu mã phản hồi OK
    try {
      await this.svc.tryMarkPaidFromReturn(q);
    } catch {}

    const r = await this.svc.handleVnpReturn(q);
    const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
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

  /** IPN (server-to-server) từ VNPay */
  @Get('vnpay/ipn')
  @ApiOperation({ summary: 'VNPay IPN (server-to-server)' })
  async vnpIpn(@Query() q: any) {
    return this.svc.handleVnpIpn(q);
  }

  /** FE poll trạng thái giao dịch VNPay theo txnRef */
  @Get('vnpay/status')
  @ApiOperation({ summary: 'Lấy trạng thái giao dịch VNPay theo txnRef' })
  async getVNPayStatus(@Query('txnRef') txnRef: string) {
    if (!txnRef) return { status: 'INVALID', message: 'Missing txnRef' };
    return this.svc.getStatusByTxnRef(txnRef);
  }
}
