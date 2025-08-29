import { Order } from "src/modules/order/entities/order.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('invoices')
export class Invoice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @OneToOne(() => Order)
    @JoinColumn()
    order: Order;

    @Column('decimal')
    totalAmount: number;

    // @Column('enum', { enum: PaymentMethod })
    // paymentMethod: PaymentMethod;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User) // Thu ngân thực hiện
    cashier: User;
}
