import { OrderStatus, OrderType } from "src/common/enums";
import { OrderItem } from "src/modules/orderitems/entities/orderitem.entity";
import { RestaurantTable } from "src/modules/restauranttable/entities/restauranttable.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Invoice } from "src/modules/invoice/entities/invoice.entity";
import { OneToOne } from "typeorm";
import { JoinColumn } from "typeorm";
import { Customer } from "src/modules/customers/entities/customers.entity";
@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User)
    createdBy: User;

    @ManyToOne(() => RestaurantTable)
    table: RestaurantTable;

    @OneToMany(() => OrderItem, (item: OrderItem) => item.order, { cascade: true })
    items: OrderItem[];

    @Column('enum', { enum: OrderStatus, default: OrderStatus.PENDING })
    status: OrderStatus;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @Column({ type: 'enum', enum: OrderType, default: OrderType.DINE_IN })
    orderType: OrderType;

    @OneToOne(() => Invoice, (inv) => inv.order)
    invoice?: Invoice;

    // 🔹 KHÁCH HÀNG CỦA ĐƠN
  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  // 🔹 SỐ LƯỢNG KHÁCH CHO ĐƠN
  @Column({ name: 'guest_count', type: 'int', nullable: true })
  guestCount?: number | null;
      @ManyToOne(() => Order, (o) => o.mergedChildren, { nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  mergedInto?: Order | null;

  // inverse (không bắt buộc dùng)
  @OneToMany(() => Order, (o) => o.mergedInto)
  mergedChildren?: Order[];
//   @DeleteDateColumn({ name: 'deleted_at', nullable: true })
// deletedAt?: Date | null;
}
