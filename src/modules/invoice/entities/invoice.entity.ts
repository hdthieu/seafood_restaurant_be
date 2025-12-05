
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
import { Customer } from "src/modules/customers/entities/customers.entity";
import { InvoicePromotion } from "@modules/promotions/entities/invoicepromotion.entity";
import { SalesReturn } from 'src/modules/returns/entities/sales-return.entity';

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

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'guest_count', type: 'int', nullable: true })
  guestCount: number | null;

  // Giảm của tất cả KM  (để báo cáo or thống kê và hiển thị không cần JOIN)
  @Column('numeric', { name: 'discount_total', precision: 12, scale: 2, default: 0 })
  discountTotal: string;

  // Doanh thu thuần = totalAmount - discountTotal
  @Column('numeric', { name: 'final_amount', precision: 12, scale: 2, default: 0 })
  finalAmount: string;

  // Thu ngân thực hiện
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'cashier_id' })
  cashier: User | null;


  @OneToMany(() => InvoicePromotion, (invPromo) => invPromo.invoice, { cascade: true })
  invoicePromotions: InvoicePromotion[];


    @OneToMany(() => SalesReturn, (r) => r.invoice)
  returns: SalesReturn[];
}
