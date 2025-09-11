import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PaymentMethod, PaymentStatus } from 'src/common/enums';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Invoice, (i) => i.payments, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @Column('enum', { enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: string;

  @Index()
  @Column({ name: 'transaction_no', nullable: true })
  transactionNo?: string; // mã giao dịch VNPay (vnp_TransactionNo)
  @Column('enum', { enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
