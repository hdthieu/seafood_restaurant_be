
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { Order } from "src/modules/order/entities/order.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ItemStatus } from "src/common/enums";
import { CreateDateColumn, UpdateDateColumn } from "typeorm";
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
    // NEW: trạng thái theo món
  @Column({ type: 'enum', enum: ItemStatus, default: ItemStatus.PENDING })
  status: ItemStatus;

  // NEW: nhóm theo lần báo bếp (mỗi notify một batch id)
  @Column({ type: 'varchar', length: 64, nullable: true })
  batchId: string | null;
  
@CreateDateColumn({ name: 'created_at' })
createdAt: Date;

@UpdateDateColumn({ name: 'updated_at' })
updatedAt: Date;
// @Column({ type: 'text', nullable: true })
// cancelReason?: string | null;

// @Column({ type: 'timestamptz', nullable: true })
// cancelledAt?: Date | null;
}