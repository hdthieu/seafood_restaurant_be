
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { Order } from "src/modules/order/entities/order.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('order_items')
export class OrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Order, (order) => order.items)
    order: Order;

    @ManyToOne(() => MenuItem)
    menuItem: MenuItem;

    @Column()
    quantity: number;

    @Column('decimal')
    price: number;

    @Column({ default: false })
    isCooked: boolean;
}