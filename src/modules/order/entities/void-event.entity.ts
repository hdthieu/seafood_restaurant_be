import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { RestaurantTable } from 'src/modules/restauranttable/entities/restauranttable.entity';
import { MenuItem } from 'src/modules/menuitems/entities/menuitem.entity';

@Entity('void_events')
export class VoidEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  order: Order;

  @ManyToOne(() => RestaurantTable, { nullable: true })
  table: RestaurantTable | null;

  @ManyToOne(() => MenuItem, { nullable: false })
  menuItem: MenuItem;

  @Column('int')
  qty: number;

  @Column({ type: 'varchar', length: 16 })
  source: 'cashier' | 'waiter' | 'kitchen';

  @Column({ type: 'varchar', length: 255, nullable: true })
  by: string | null;          // có thể giữ để log text thô

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;


  @ManyToOne(() => User, { nullable: true })
createdBy: User | null;
}
