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
import { PaymentMethod } from 'src/common/enums';
import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import {PaymentsGateway} from "./payments.gateway";
@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly svc: PaymentService,
    private readonly vietqr: VietQRService,
    private readonly invoiceSvc: InvoicesService,
    @InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>,
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
      .filter((p) => p.status === 'PAID')
      .reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(inv.totalAmount);
    const remaining = Math.max(0, total - paid);

    return { status: inv.status, total, paid, remaining };
  }

  /* -------------------- Mock success (dùng sandbox) -------------------- */
  @Post('mock/vietqr-success')
  @ApiOperation({ summary: 'Đánh dấu PAID (VIETQR) – chỉ dùng cho demo' })
  async mockVietQrSuccess(@Body() dto: { invoiceId: string; amount?: number }) {
    const inv = await this.invRepo.findOne({ where: { id: dto.invoiceId }, relations: ['payments'] });
    if (!inv) return { ok: false, message: 'INVOICE_NOT_FOUND' };

    const paid = (inv.payments ?? [])
      .filter((p) => p.status === 'PAID')
      .reduce((s, p) => s + Number(p.amount), 0);

    const remain = Math.max(0, Number(inv.totalAmount) - paid);
    const amount = Math.round(dto.amount ?? remain);
    if (amount <= 0) return { ok: false, message: 'NOTHING_TO_PAY' };

    await this.invoiceSvc.addPayment(inv.id, { amount, method: PaymentMethod.VIETQR });
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
 @Post('vietqr/webhook')
async vietQrWebhook(
  @Req() req: Request & { rawBody?: Buffer },
  @Body() body: any,
) {
  const raw = req.rawBody?.toString?.() || JSON.stringify(body);
  const sigHeader = req.headers['x-signature'];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : (sigHeader as string | undefined);
  if (!this.svc.verifyWebhookSignature(raw, signature)) {
    throw new BadRequestException('INVALID_SIGNATURE');
  }

  const txns = Array.isArray(body?.transactions) ? body.transactions : [body];

  for (const t of txns) {
    const amount = Math.round(Number(t.amount || 0));
    const desc: string = String(t.description || t.content || '');
    const extId: string = String(t.id || t.txnId || t.reference || '');
    if (!amount || amount <= 0) continue;
    if (await this.svc.isTxnProcessed(extId)) continue;

    // 1) Bắt cả các biến thể: "INV:xxxx", "INV xxxx", "INV-xxxx", hoặc "INVxxxx"
    const m = desc.match(/INV[:\s-]?([a-f0-9-]{8,64})/i);
    if (!m) continue;

    // 2) Chuẩn hóa id: bank có thể bỏ gạch → so sánh dạng không gạch
    const candidate = m[1].toLowerCase().replace(/[^a-f0-9]/g, ''); // chỉ giữ hex
    let inv =
      await this.invRepo
        .createQueryBuilder('i')
        .where("REPLACE(i.id,'-','') = :cid", { cid: candidate })
        .getOne();

    // fallback: nếu DB lưu id không phải UUID (ví dụ id thuần 32/40 ký tự)
    if (!inv) {
      inv = await this.invRepo.findOne({ where: { id: m[1] } });
    }
    if (!inv) continue;

    // 3) Đối soát số tiền
    const paid = (inv.payments ?? [])
      .filter((p) => p.status === 'PAID')
      .reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(inv.totalAmount) - paid);

    // Cho phép sai lệch rất nhỏ do làm tròn (nếu muốn): const ok = Math.abs(amount - remaining) <= 1;
    if (amount !== remaining) continue;

    await this.invoiceSvc.addPayment(inv.id, {
      amount,
      method: PaymentMethod.VIETQR,
      externalTxnId: extId,
      note: desc,
    });
    this.gateway.emitPaid(inv.id, {
  invoiceId: inv.id,
  amount,
  method: 'VIETQR',
});
  }

  return { ok: true };
}


  /* ----------------------------------------------------------------
   * 3) VNPay: create URL, return redirect, IPN, polling theo txnRef
   * ---------------------------------------------------------------- */

  /** Tạo URL thanh toán VNPay */
  @Post('vnpay/create')
  @ApiOperation({ summary: 'Tạo URL VNPay' })
  @ApiBody({ type: CreateVNPayDto })
  async createVNPay(@Body() dto: CreateVNPayDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.socket?.remoteAddress as string) ||
      '127.0.0.1';

    return this.svc.createVNPayUrl({ ...dto, ipAddress: ip });
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
