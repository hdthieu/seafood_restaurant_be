// src/modules/payments/vietqr.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoice/entities/invoice.entity';

@Injectable()
export class VietQRService {
  private readonly logger = new Logger(VietQRService.name);

  constructor(@InjectRepository(Invoice) private readonly invRepo: Repository<Invoice>) {}

  private cfg() {
    const acqId = process.env.VIETQR_BANK_BIN?.trim();
    const accountNo = process.env.VIETQR_ACCOUNT_NO?.trim();
    const accountName = process.env.VIETQR_ACCOUNT_NAME?.trim() || undefined;

    if (!acqId || !accountNo) {
      this.logger.error(`Missing VIETQR env: BIN=${acqId || 'null'} / ACC=${accountNo || 'null'}`);
      // 400 thay vì 500 để FE thấy message cụ thể
      throw new BadRequestException('MISSING_VIETQR_ENV');
    }
    return { acqId, accountNo, accountName };
  }

  /** Tạo QR động: amount + addInfo=INV:<invoiceId> */
  async createQr(invoiceId: string, amount?: number) {
    this.logger.log(`createQr invoiceId=${invoiceId} amount=${amount}`);
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

    const expireAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return {
      invoiceId: inv.id,
      amount: amt,
      addInfo,
      qrUrl,
      imgUrl: qrUrl, // alias cho FE
      expireAt,
    };
  }
}
