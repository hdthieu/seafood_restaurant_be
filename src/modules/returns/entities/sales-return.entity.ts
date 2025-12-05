import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {Invoice} from 'src/modules/invoice/entities/invoice.entity'
import { Order } from 'src/modules/order/entities/order.entity';
import { Customer } from 'src/modules/customers/entities/customers.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SalesReturnItem } from './sale-return-item.enity';
import { RefundMethod, SalesReturnStatus, SalesReturnType } from 'src/common/enums';

@Entity('sales_returns')
export class SalesReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Mã phiếu trả: RT000001...
  @Index({ unique: true })
  @Column({ name: 'return_number', type: 'varchar', length: 32 })
  returnNumber: string;

  // Hoá đơn gốc
  @ManyToOne(() => Invoice, (inv) => inv.returns, { eager: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  // Order gốc (cho dễ join)
  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({
    name: 'return_type',
    type: 'enum',
    enum: SalesReturnType,
    default: SalesReturnType.PARTIAL,
  })
  type: SalesReturnType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SalesReturnStatus,
    default: SalesReturnStatus.COMPLETED,
  })
  status: SalesReturnStatus;

  // Tổng tiền hàng bị trả (theo giá bán)
  @Column('numeric', { name: 'goods_amount', precision: 12, scale: 2 })
  goodsAmount: string;

  // Giảm giá phân bổ cho phần trả (nếu có)
  @Column('numeric', {
    name: 'discount_amount',
    precision: 12,
    scale: 2,
    default: 0,
  })
  discountAmount: string;

  // Số tiền hoàn lại cho khách = goodsAmount - discountAmount
  @Column('numeric', { name: 'refund_amount', precision: 12, scale: 2 })
  refundAmount: string;

  @Column({
    name: 'refund_method',
    type: 'enum',
    enum: RefundMethod,
    default: RefundMethod.CASH,
  })
  refundMethod: RefundMethod;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  // Thu ngân thao tác
  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'cashier_id' })
  cashier: User | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @OneToMany(() => SalesReturnItem, (it) => it.return, { cascade: true })
  items: SalesReturnItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
