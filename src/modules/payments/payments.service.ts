// src/modules/payments/payment.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { InvoicesService } from 'src/modules/invoice/invoice.service';
import { PaymentMethod, PaymentStatus } from 'src/common/enums';

type CreateManualPaymentDto = {
  invoiceId: string;
  amount: number;
  // tuỳ UI, có thể gửi FAILED để ghi log thất bại (không đổi trạng thái hóa đơn)
  status?: 'SUCCESS' | 'FAILED';
};

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly invoiceService: InvoicesService,
  ) {}

  /** Tạo payment tiền mặt.
   *  SUCCESS -> uỷ quyền InvoicesService.addPayment để tính trạng thái hóa đơn.
   *  FAILED  -> lưu 1 dòng payment status=FAILED, không đổi invoice.
   */
  async createManual(dto: CreateManualPaymentDto) {
    const invoice = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
    if (!invoice) throw new BadRequestException('INVOICE_NOT_FOUND');

    if (dto.status === 'FAILED') {
      await this.paymentRepo.save(
        this.paymentRepo.create({
          invoiceId: invoice.id,
          amount: Number(dto.amount).toFixed(2),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.FAILED,
        }),
      );
      return { ok: false, status: PaymentStatus.FAILED, invoiceId: invoice.id };
    }

    // SUCCESS: thêm payment & tính lại invoice
    const ret = await this.invoiceService.addPayment(invoice.id, {
      amount: dto.amount,
      method: PaymentMethod.CASH,
    });

    return { ok: true, status: PaymentStatus.SUCCESS, ...ret };
  }
}
