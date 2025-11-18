import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoicesService } from 'src/modules/invoice/invoice.service';
import { hmacSHA512, sortObject, toQueryString, nowYmdHisGMT7, addMinutesYmdHisGMT7 } from 'src/lib/vnpay';
import { Payment } from 'src/modules/payments/entities/payment.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PaymentMethod, PaymentStatus, InvoiceStatus } from 'src/common/enums';
import { DeepPartial } from 'typeorm/common/DeepPartial';
import * as crypto from 'crypto';
export type CreatePendingPaymentDto = {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  externalTxnId?: string | null;
  note?: string | null;
  expireAt?: Date | string | null;
};
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
  ) { }

  private get config() {
    const vnpUrl = (process.env.VNP_URL ?? '').trim().replace(/\/+$/, '');
    const tmnCode = (process.env.VNP_TMN_CODE ?? '').trim();
    const hashSecret = (process.env.VNP_HASH_SECRET ?? '').trim();
    const returnUrl = (process.env.VNP_RETURN_URL ?? '').trim();
    const version = (process.env.VNP_VERSION ?? '2.1.0').trim();
    const locale = (process.env.VNP_LOCALE ?? 'vn').trim();
    if (!vnpUrl || !tmnCode || !hashSecret || !returnUrl) {
      console.log('[VNPay] Missing config:', { vnpUrl, tmnCode, hashSecret: !!hashSecret, returnUrl });
      throw new Error('VNPay ENV is missing!');
    }
    return { tmnCode, hashSecret, vnpUrl, returnUrl, version, locale };
  }

  /** Tạo URL VNPay + lưu payment PENDING để FE polling */
  /** Tạo URL VNPay + lưu payment PENDING để FE polling */
  async createVNPayUrl(dto: CreateVNPayParams) {
    // cần payments để tính remaining
    const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId }, relations: ['payments'] });
    if (!inv) throw new ResponseException('INVOICE_NOT_FOUND', 400);

    const paid = (inv.payments ?? [])
      .filter(p => p.status === PaymentStatus.SUCCESS)
      .reduce((s, p) => s + Number(p.amount), 0);

    const total = Number(inv.totalAmount);
    const remaining = Math.max(0, total - paid);

    // amount FE truyền vào (nếu có) nhưng KHÔNG vượt remaining
    const want = Math.round(Number(dto.amount ?? remaining));
    const amount = Math.min(want, remaining);

    if (!amount || amount <= 0) throw new ResponseException('INVALID_AMOUNT', 400);

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
      vnp_Amount: amount * 100,             // ✅ dùng remaining
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: dto.ipAddress || '127.0.0.1',
      vnp_CreateDate,
      vnp_ExpireDate,
    };

    const sorted = sortObject(params);
    const signData = toQueryString(sorted);
    const vnp_SecureHash = hmacSHA512(hashSecret, signData);
    const payUrl = `${vnpUrl}?${signData}&vnp_SecureHash=${vnp_SecureHash}`;

    // Lưu payment PENDING với số tiền dự kiến (remaining)
    await this.paymentRepo.save(
      this.paymentRepo.create({
        invoice: inv,
        amount,
        method: PaymentMethod.VIETQR,
        txnRef: vnp_TxnRef,
        status: PaymentStatus.PENDING,
        expireAt: vnp_ExpireDate,
      }),
    );

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
  /** IPN (server-to-server): xác thực, cập nhật Payment & set Invoice = PAID khi thành công */
  // payments.service.ts
  async handleVnpIpn(q: any) {
    const { hashSecret } = this.config;

    try {
      // 1) Verify checksum như hiện tại
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

      // 2) Lấy invoiceId | orderId từ vnp_OrderInfo
      const rawInfo = String(q.vnp_OrderInfo || '');
      const info = parseOrderInfo(rawInfo);

      let invoiceId = info.invoiceId;
      let inv: Invoice | null = null;

      if (invoiceId) {
        inv = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
      }

      // 3) Fallback: chưa có invoice → tạo/tìm từ orderId (idempotent)
      if (!inv && info.orderId) {
        const created = await this.invoiceService.createFromOrder(info.orderId);
        inv = created;
        invoiceId = created.id;
      }

      if (!inv) {
        // không có cả invoice lẫn order
        return { RspCode: '01', Message: 'Order not found' };
      }

      // 4) Lấy dữ liệu giao dịch
      const txnRef = String(q.vnp_TxnRef || '');
      const responseCode = q.vnp_ResponseCode;
      const amount = Number(q.vnp_Amount || 0) / 100;

      // 5) Cập nhật bản ghi payment theo txnRef (nếu có)
      const pay = await this.paymentRepo.findOne({ where: { txnRef } });
      if (pay) {
        pay.responseCode = responseCode || null;
        pay.transactionNo = q.vnp_TransactionNo || null;
        pay.bankCode = q.vnp_BankCode || null;
        pay.cardType = q.vnp_CardType || null;
        pay.status = responseCode === '00' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
        await this.paymentRepo.save(pay);
      }

      // 6) Idempotent: đã PAID thì trả 02
      if (inv.status === InvoiceStatus.PAID) {
        return { RspCode: '02', Message: 'Order already confirmed', _meta: { invoiceId, amount, paid: true } };
      }

      // 7) Thành công → cộng tiền (addPayment tự co về remaining & set Order.PAID)
      if (responseCode === '00') {
        await this.invoiceService.addPayment(inv.id, {
          amount,
          // method: PaymentMethod.VIETQR,
          txnRef,
        });
        return { RspCode: '00', Message: 'Success', _meta: { invoiceId, amount, paid: true } };
      }

      // 8) Thất bại vẫn trả 00 (đã nhận IPN)
      return { RspCode: '00', Message: 'Received (Failed payment)', _meta: { invoiceId, amount, paid: false } };
    } catch (_e) {
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
    const r = await this.handleVnpReturn(q);
    if (!r.ok || r.code !== '00' || !r.invoiceId || !r.amount) return false;

    const inv = await this.invoiceRepo.findOne({ where: { id: r.invoiceId }, relations: ['payments'] });
    if (!inv) return false;
    if (inv.status === InvoiceStatus.PAID) return true;

    // nếu có bản ghi PENDING theo txnRef thì mark nó success
    const p = await this.paymentRepo.findOne({ where: { txnRef: r.txnRef || '' } });
    if (p) {
      p.status = PaymentStatus.SUCCESS;
      p.responseCode = '00';
      await this.paymentRepo.save(p);
    }

    const paid = (inv.payments ?? [])
      .filter(x => x.status === PaymentStatus.SUCCESS)
      .reduce((s, x) => s + Number(x.amount), 0);
    const total = Number(inv.totalAmount);
    const remaining = Math.max(0, total - paid);

    let amount = Number(r.amount);
    if (amount > remaining) amount = remaining;
    if (amount <= 0) return true; // không còn gì để cộng

    await this.invoiceService.addPayment(inv.id, {
      amount,
      method: PaymentMethod.VIETQR,
      txnRef: r.txnRef,
    });

    return true;
  }


  //vietqr 
  async isTxnProcessed(externalTxnId: string) {
    if (!externalTxnId) return false;
    const exist = await this.paymentRepo.findOne({ where: { externalTxnId } });
    return !!exist;
  }
  private get checksum() {
    const key = process.env.PAYOS_CHECKSUM_KEY?.trim();
    if (!key) throw new Error('Missing PAYOS_CHECKSUM_KEY');
    return key;
  }
  verifySignature(rawBody: string | Buffer, signature?: string | string[]) {
    if (!signature) return false;
    const sig = Array.isArray(signature) ? signature[0] : signature;
    const calc = crypto
      .createHmac('sha256', this.checksum)
      .update(rawBody)
      .digest('hex');
    // so sánh an toàn thời gian
    try {
      return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  async findPendingPaymentByOrderCode(orderCode: number) {
    return this.paymentRepo.findOne({ where: { externalTxnId: String(orderCode), status: PaymentStatus.PENDING } });
  }

  async markPaymentSuccessByOrderCode(orderCode: number, extra?: { transactionId?: string }) {
    const pay = await this.paymentRepo.findOne({ where: { externalTxnId: String(orderCode) } });
    if (!pay) return;

    pay.status = PaymentStatus.SUCCESS;

    // chỉ set externalTxnId = transactionId nếu chưa bị dùng
    if (extra?.transactionId) {
      const txId = String(extra.transactionId);
      const dup = await this.paymentRepo.exist({ where: { externalTxnId: txId } });
      if (!dup) {
        pay.externalTxnId = txId;
      } else {
        // giữ nguyên orderCode, ghi transactionId vào note để đối soát
        pay.note = [pay.note, `txnId=${txId}`].filter(Boolean).join(' | ');
      }
    }

    await this.paymentRepo.save(pay);
  }

  async createPendingPayment(dto: CreatePendingPaymentDto) {
    const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
    if (!inv) throw new BadRequestException('INVOICE_NOT_FOUND');

    const p = this.paymentRepo.create({
      invoice: { id: inv.id } as any,
      amount: Math.round(Number(dto.amount || 0)),
      method: dto.method,
      status: PaymentStatus.PENDING,
      externalTxnId: dto.externalTxnId ?? null,
      note: dto.note ?? null,
      expireAt: dto.expireAt ? new Date(dto.expireAt) : null,
    } as DeepPartial<Payment>);  // <-- cast để tránh match overload mảng

    return this.paymentRepo.save(p);
  }
  // thêm vào PaymentService
  verifyPayOSSignatureFlexible(rawBody: string, body: any, headerSig?: string | string[]) {
    // 1) Nếu có header → verify như cũ (raw body)
    if (headerSig) return this.verifySignature(rawBody, headerSig);

    // 2) Fallback: signature trong body
    const sig = body?.signature || body?.data?.signature;
    if (!sig) return false;

    // PayOS thường ký HMAC-SHA256 trên JSON của "data"
    const payload = JSON.stringify(body?.data ?? body);
    const calc = crypto.createHmac('sha256', this.checksum).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(sig));
    } catch {
      return false;
    }
  }

}
function parseOrderInfo(s: string) {
  const out: any = {};
  // chấp nhận các mẫu: "INV:<uuid>", "ORD:<uuid>", hoặc chuỗi ghép "INV:...|ORD:..."
  const inv = s.match(/INV:([a-f0-9-]{8,36})/i);
  const ord = s.match(/ORD:([a-f0-9-]{8,36})/i);
  if (inv) out.invoiceId = inv[1];
  if (ord) out.orderId = ord[1];
  return out;
}
