
import { User } from "src/modules/user/entities/user.entity";




import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { InvoiceStatus } from 'src/common/enums';
import { Payment } from 'src/modules/payments/entities/payment.entity';
import { Order } from 'src/modules/order/entities/order.entity';

// invoices.entity.ts
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true })
  @Column({ name: 'invoice_number' })
  invoiceNumber: string;

  @OneToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column('numeric', { name: 'total_amount', precision: 12, scale: 2 })
  totalAmount: string;

  @Column('enum', { enum: InvoiceStatus, default: InvoiceStatus.UNPAID })
  status: InvoiceStatus;

  @OneToMany(() => Payment, (p) => p.invoice, { cascade: true })
  payments: Payment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;



  // @ManyToOne(() => User) // Thu ngân thực hiện
  // cashier: User||null;
}
