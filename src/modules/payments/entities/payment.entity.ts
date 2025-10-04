// src/modules/payments/entities/payment.entity.ts
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index,
  ManyToOne, JoinColumn
} from 'typeorm';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';

import { PaymentMethod, PaymentStatus } from 'src/common/enums';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  @Index()
  invoiceId!: string;

  @ManyToOne(() => Invoice, inv => inv.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice!: Invoice;

  // Postgres bigint → TypeORM thường trả string; nếu muốn number thì cân nhắc dùng numeric
  @Column({ type: 'bigint' })
  amount!: number;

  // union type → bắt buộc khai báo type rõ ràng
  @Column({ type: 'varchar', length: 20 })
  method!: PaymentMethod; // 'CASH' | 'VNPAY'

  // ---- VNPay fields (tất cả chỉ rõ type) ----
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  txnRef!: string | null; // vnp_TxnRef

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: PaymentStatus;   // 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'

  @Column({ type: 'varchar', length: 32, nullable: true })
  bankCode!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  cardType!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  transactionNo!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  responseCode!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  // yyyyMMddHHmmss GMT+7 → tối đa 14 ký tự
  @Column({ type: 'varchar', length: 14, nullable: true })
  expireAt!: string | null;

  
  @Column({ type: 'varchar', nullable: true, unique: true })
  externalTxnId?: string;
}
