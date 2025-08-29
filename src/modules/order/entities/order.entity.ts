import { OrderStatus, OrderType } from "src/common/enums";
import { OrderItem } from "src/modules/orderitems/entities/orderitem.entity";
import { RestaurantTable } from "src/modules/restauranttable/entities/restauranttable.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: 'enum', enum: OrderType, default: OrderType.DINE_IN })
    orderType: OrderType;

}
