import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

type CreateLinkParams = {
  orderCode?: number;
  amount: number;
  description: string;   // ví dụ: "INV:76debb09"
  buyerName?: string;
};

@Injectable()
export class PayOSService {
  private readonly logger = new Logger('PayOSREST');
  private readonly base = 'https://api-merchant.payos.vn'; // ✅ luôn dùng domain này

  private get env() {
    const cid = (process.env.PAYOS_CLIENT_ID || '').trim();
    const key = (process.env.PAYOS_API_KEY || '').trim();
    const cs  = (process.env.PAYOS_CHECKSUM_KEY || '').trim();
    const ret = (process.env.PAYOS_RETURN_URL || '').trim();
    const can = (process.env.PAYOS_CANCEL_URL || '').trim();
    if (!cid || !key || !cs || !ret || !can) {
      throw new Error('Missing PAYOS env (CLIENT_ID/API_KEY/CHECKSUM/RETURN_URL/CANCEL_URL)');
    }
    this.logger.log(`[PayOS][env] base=${this.base}`);
    this.logger.log(`[PayOS][env] returnUrl=${ret}`);
    this.logger.log(`[PayOS][env] cancelUrl=${can}`);
    return { cid, key, cs, ret, can };
  }

  private genOrderCode() {
    // PayOS yêu cầu kiểu number và duy nhất
    return Math.floor(1e12 + Math.random() * 9e12); // 13 chữ số cho chắc
  }

  // ✅ ĐÚNG SPEC: sort theo alphabet & dùng raw values (không encode)
  private buildSignature(amount: number, cancelUrl: string, description: string, orderCode: number, returnUrl: string) {
    const payloadStr =
      `amount=${amount}` +
      `&cancelUrl=${cancelUrl}` +
      `&description=${description}` +
      `&orderCode=${orderCode}` +
      `&returnUrl=${returnUrl}`;

    const sig = crypto.createHmac('sha256', this.env.cs).update(payloadStr).digest('hex');
    this.logger.log(`[PayOS][sign] raw=${payloadStr}`);
    this.logger.log(`[PayOS][sign] sig=${sig}`);
    return sig;
  }

  async createPaymentLink(params: CreateLinkParams) {
    const { cid, key, ret, can } = this.env;
    const orderCode = params.orderCode ?? this.genOrderCode();

    // ⚠️ description ngắn gọn theo giới hạn kênh (ví dụ “INV:76debb09”)
    const description = String(params.description).slice(0, 25);
    const amount = Math.round(params.amount);

    const signature = this.buildSignature(amount, can, description, orderCode, ret);

    const body = {
      orderCode,
      amount,
      description,
      returnUrl: ret,
      cancelUrl: can,
      buyerName: params.buyerName?.slice(0, 255),
      signature,
    };

    this.logger.log(`[PayOS][create] BASE=${this.base}`);
    this.logger.log(`[PayOS][create] PAYLOAD=${JSON.stringify(body, null, 2)}`);

    const { data } = await axios.post(
      `${this.base}/v2/payment-requests`,
      body,
      {
        headers: {
          'x-client-id': cid,
          'x-api-key': key,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );

    this.logger.log(`[PayOS][create] RESP=${JSON.stringify(data)}`);

    if (data?.code !== '00' || !data?.data?.checkoutUrl) {
      // code "201" => signature sai; "20" => tham số/domain không đúng, v.v.
      throw new Error(data?.desc || data?.message || 'PAYOS_CREATE_FAILED');
    }

    return data.data as {
      paymentLinkId: string;
      checkoutUrl: string;
      qrCode: string;
      orderCode: number;
      amount: number;
      description: string;
    };
  }
}
