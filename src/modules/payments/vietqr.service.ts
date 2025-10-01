// src/modules/payments/vietqr.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoice/entities/invoice.entity';

@Injectable()
export class VietQRService {
  constructor(@InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>) {}

  private cfg() {
    const acqId = process.env.VIETQR_BANK_BIN?.trim();
    const accountNo = process.env.VIETQR_ACCOUNT_NO?.trim();
    const accountName = process.env.VIETQR_ACCOUNT_NAME?.trim() || undefined;
    if (!acqId || !accountNo) throw new Error('Missing VIETQR env');
    return { acqId, accountNo, accountName };
  }

  /**
   * Tạo QR động trên img.vietqr.io:
   *  - amount: số tiền chính xác (khóa ở đa số app)
   *  - addInfo: "INV:<invoiceId>" để auto đối soát
   *  - template: compact.png (đẹp cho mobile); có thể đổi "print.png"
   */
  async createQr(invoiceId: string, amount?: number) {
    const inv = await this.invRepo.findOne({ where: { id: invoiceId } });
    if (!inv) throw new BadRequestException('INVOICE_NOT_FOUND');

    const total = Number(inv.totalAmount);
    const amt = Math.round(Number(amount ?? total));
    if (!amt || amt <= 0) throw new BadRequestException('INVALID_AMOUNT');

    const { acqId, accountNo, accountName } = this.cfg();
    const addInfo = `INV:${inv.id}`;

    const qrUrl =
      `https://img.vietqr.io/image/${acqId}-${accountNo}-compact.png` +
      `?amount=${amt}&addInfo=${encodeURIComponent(addInfo)}` +
      (accountName ? `&accountName=${encodeURIComponent(accountName)}` : '');

    // nếu bạn tích hợp nhà cung cấp Quicklink/deeplink (Casso/MyVietQR),
    // tạo thêm deeplink để "khóa cứng" amount & addInfo trong app bank:
    const deeplink: string | undefined = undefined; // <-- thay bằng link thực nếu có

    const expireAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return {
      invoiceId: inv.id,
      amount: amt,
      addInfo,
      qrUrl,
      imgUrl: qrUrl, // alias cho FE
      deeplink,
      expireAt,
    };
  }
}
