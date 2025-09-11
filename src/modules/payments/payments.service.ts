import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoicesService } from 'src/modules/invoice/invoice.service';
import { PaymentMethod, PaymentStatus } from 'src/common/enums';
import { hmacSHA512, sortObject, toQueryString, nowYmdHisGMT7, addMinutesYmdHisGMT7 } from 'src/lib/vnpay';
import { Payment } from 'src/modules/payments/entities/payment.entity';

type CreateVNPayParams = {
  invoiceId: string;
  amount?: number;
  bankCode?: string;
  ipAddress: string;
  expireInMinutes?: number;
};

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly invoiceService: InvoicesService,
  ) {}

  private get config() {
    const vnpUrl     = (process.env.VNP_URL ?? '').trim().replace(/\/+$/,'');
    const tmnCode    = (process.env.VNP_TMN_CODE ?? '').trim();
    const hashSecret = (process.env.VNP_HASH_SECRET ?? '').trim();
    const returnUrl  = (process.env.VNP_RETURN_URL ?? '').trim();
    const version    = (process.env.VNP_VERSION ?? '2.1.0').trim();
    const locale     = (process.env.VNP_LOCALE ?? 'vn').trim();
    if (!vnpUrl || !tmnCode || !hashSecret || !returnUrl) {
      throw new Error('VNPay ENV is missing!');
    }
    return { tmnCode, hashSecret, vnpUrl, returnUrl, version, locale };
  }

  /** Tạo URL VNPay + lưu payment PENDING để FE polling */
  async createVNPayUrl(dto: CreateVNPayParams) {
    const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
    if (!inv) throw new BadRequestException('INVOICE_NOT_FOUND');

    const amount = Math.round(Number(dto.amount ?? inv.totalAmount));
    if (!amount || amount <= 0) throw new BadRequestException('INVALID_AMOUNT');

    const { tmnCode, hashSecret, vnpUrl, returnUrl, version, locale } = this.config;

    const vnp_TxnRef = Date.now().toString();
    const vnp_CreateDate = nowYmdHisGMT7();
    const expireIn = Number.isFinite(dto.expireInMinutes) ? Math.max(1, Number(dto.expireInMinutes)) : 15;
    const vnp_ExpireDate = addMinutesYmdHisGMT7(expireIn);

    const params: Record<string, string | number> = {
      vnp_Version: version,
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: locale,
      vnp_CurrCode: 'VND',
      vnp_TxnRef,
      vnp_OrderInfo: `INV:${inv.id}`,
      vnp_OrderType: 'other',
      vnp_Amount: amount * 100,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: dto.ipAddress || '127.0.0.1',
      vnp_CreateDate,
      vnp_ExpireDate,
    };

    // Nếu muốn ép kênh khi đã chắc chắn sandbox bật, mở dòng dưới:
    // if (dto.bankCode) params['vnp_BankCode'] = dto.bankCode;

    const sorted = sortObject(params);
    const signData = toQueryString(sorted);
    const vnp_SecureHash = hmacSHA512(hashSecret, signData);

    const payUrl = `${vnpUrl}?${signData}&vnp_SecureHash=${vnp_SecureHash}`;

    // Lưu trạng thái PENDING cho txnRef
    await this.paymentRepo.save(
      this.paymentRepo.create({
        invoice: inv,
        amount,
        method: 'VNPAY',
        txnRef: vnp_TxnRef,
        status: 'PENDING',
        expireAt: vnp_ExpireDate,
      }),
    );

    // Log phục vụ debug
    console.log('[VNPay][createVNPayUrl] payUrl =', payUrl);
    console.log('[VNPay][createVNPayUrl] params =', params);

    return { payUrl, invoiceId: inv.id, vnp_TxnRef, expireAt: vnp_ExpireDate };
  }

  /** Return (browser): chỉ xác thực checksum & redirect về FE */
  async handleVnpReturn(q: any) {
    const { hashSecret } = this.config;
    const secureHash = String(q.vnp_SecureHash || '').toLowerCase();

    const clone: any = { ...q };
    delete clone.vnp_SecureHash;
    delete clone.vnp_SecureHashType;

    const sorted = sortObject(clone);
    const signData = toQueryString(sorted);
    const calc = hmacSHA512(hashSecret, signData);

    const ok = secureHash === calc.toLowerCase();
    const invoiceId = String(q.vnp_OrderInfo || '').replace(/^INV:/, '') || undefined;

    return {
      ok,
      code: q.vnp_ResponseCode,
      message: q.vnp_Message || undefined,
      bankCode: q.vnp_BankCode || undefined,
      txnRef: q.vnp_TxnRef,
      amount: q.vnp_Amount ? Number(q.vnp_Amount) / 100 : undefined,
      invoiceId,
    };
  }

  /** IPN (server-to-server): xác thực, cập nhật Payment & set Invoice = PAID khi thành công */
  async handleVnpIpn(q: any) {
    const { hashSecret } = this.config;

    try {
      const secureHash = String(q.vnp_SecureHash || '').toLowerCase();
      const clone: any = { ...q };
      delete clone.vnp_SecureHash;
      delete clone.vnp_SecureHashType;

      const sorted = sortObject(clone);
      const signData = toQueryString(sorted);
      const calc = hmacSHA512(hashSecret, signData);
      if (secureHash !== calc.toLowerCase()) {
        return { RspCode: '97', Message: 'Invalid Checksum' };
      }

      const invoiceId = String(q.vnp_OrderInfo || '').replace(/^INV:/, '');
      if (!invoiceId) return { RspCode: '01', Message: 'Order not found' };

      const inv = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
      if (!inv) return { RspCode: '01', Message: 'Order not found' };

      const txnRef = String(q.vnp_TxnRef || '');
      const responseCode = q.vnp_ResponseCode;
      const amount = Number(q.vnp_Amount || 0) / 100;

      // Cập nhật bản ghi payment theo txnRef
      const pay = await this.paymentRepo.findOne({ where: { txnRef } });
      if (pay) {
        pay.responseCode = responseCode || null;
        pay.transactionNo = q.vnp_TransactionNo || null;
        pay.bankCode = q.vnp_BankCode || null;
        pay.cardType = q.vnp_CardType || null;
        pay.status = responseCode === '00' ? 'PAID' : 'FAILED';
        await this.paymentRepo.save(pay);
      }

      // Idempotent: nếu invoice đã PAID, trả '02'
      if ((inv as any).status === 'PAID') {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      // Thành công -> cộng tiền + set invoice PAID
      if (responseCode === '00') {
        await this.invoiceService.addPayment(inv.id, {
          amount,
          method: PaymentMethod.VNPAY,
        });
        return { RspCode: '00', Message: 'Success' };
      }

      // Thất bại -> vẫn trả 00 cho VNPay (đã nhận IPN)
      return { RspCode: '00', Message: 'Received (Failed payment)' };
    } catch (e) {
      return { RspCode: '99', Message: 'Unhandled error' };
    }
  }

  /** Thanh toán tiền mặt (demo) */
  async createManual(dto: { invoiceId: string; amount: number; status?: 'SUCCESS' | 'FAILED' }) {
    const invoice = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
    if (!invoice) throw new BadRequestException('INVOICE_NOT_FOUND');

    if (dto.status === 'FAILED') {
      return { ok: false, status: PaymentStatus.FAILED, invoiceId: invoice.id };
    }

    const ret = await this.invoiceService.addPayment(invoice.id, {
      amount: dto.amount,
      method: PaymentMethod.CASH,
    });

    return { ok: true, status: PaymentStatus.SUCCESS, ...ret };
  }

  /** Endpoint cho FE polling theo txnRef */
async getStatusByTxnRef(txnRef: string) {
  const p = await this.paymentRepo.findOne({
    where: { txnRef },
    relations: ['invoice'],            // load invoice
  });
  if (!p) return { status: 'PENDING' };

  return {
    status: p.status,
    invoiceId: p.invoice?.id ?? p.invoiceId, // vẫn fallback đề phòng
    amount: Number(p.amount),
  };
}
// payment.service.ts
async tryMarkPaidFromReturn(q: any) {
  // tái dùng verify như handleVnpReturn
  const r = await this.handleVnpReturn(q);
  if (!r.ok || r.code !== '00' || !r.invoiceId || !r.amount) return false;

  // idempotent: nếu invoice đã PAID thì thôi
  const inv = await this.invoiceRepo.findOne({ where: { id: r.invoiceId } });
  if (!inv) return false;
  if (inv.status === 'PAID') return true;

  // cập nhật bản ghi payment theo txnRef nếu đã tạo lúc createVNPayUrl
  const p = await this.paymentRepo.findOne({ where: { txnRef: r.txnRef || '' } });
  if (p) {
    p.status = 'PAID';
    p.responseCode = '00';
    await this.paymentRepo.save(p);
  }

  // cộng tiền & set invoice = PAID
  await this.invoiceService.addPayment(inv.id, {
    amount: r.amount,
    method: PaymentMethod.VNPAY,       
    txnRef: r.txnRef,
  });

  return true;
}





}
