import { Orderitem } from "src/modules/orderitems/entities/orderitem.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Table, UpdateDateColumn } from "typeorm";

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User) // Người tạo đơn
    createdBy: User;

    @ManyToOne(() => Table)
    table: Table;

    @OneToMany(() => Orderitem, (item: Orderitem) => item.order, { cascade: true })
    items: Orderitem[];

    @Column('enum', { enum: OrderStatus, default: OrderStatus.PENDING })
    status: OrderStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
