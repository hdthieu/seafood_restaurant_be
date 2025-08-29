import { OrderStatus } from "src/common/enums";
import { Order } from "src/modules/order/entities/order.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('order_status_history')
export class OrderStatusHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Order)
    order: Order;

    @Column('enum', { enum: OrderStatus })
    status: OrderStatus;

    @ManyToOne(() => User)
    updatedBy: User;

    @CreateDateColumn()
    changedAt: Date;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @Column({ name: 'created_by', nullable: true })
    createdBy?: string;
}