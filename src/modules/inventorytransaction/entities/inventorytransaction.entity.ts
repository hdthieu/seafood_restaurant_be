import {
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    Column,
    CreateDateColumn,
    Index,
    Check,
} from 'typeorm';
import { InventoryItem } from 'src/modules/inventoryitems/entities/inventoryitem.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { InventoryAction } from 'src/common/enums';
import { Supplier } from '@modules/supplier/entities/supplier.entity';

@Entity('inventory_transactions')
@Index(['item', 'createdAt'])
@Index(['refType', 'refId'])
@Index(['refItemId'])
@Check(`"quantity" > 0`)
export class InventoryTransaction {
    @PrimaryGeneratedColumn('uuid') id: string;

    @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    item: InventoryItem;

    @Column({ type: 'numeric', precision: 12, scale: 3 })
    quantity: number;

    @Column({ type: 'enum', enum: InventoryAction })
    action: InventoryAction;

    @Column('numeric', { precision: 12, scale: 2, nullable: true })
    unitCost?: number;

    @Column('numeric', { precision: 14, scale: 2, nullable: true })
    lineCost?: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    beforeQty?: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    afterQty?: number;

    // Nguồn phát sinh giao dịch
    @Column({ type: 'varchar', length: 50, nullable: true })
    refType?: string;

    // Nếu mọi chứng từ của bạn đều dùng UUID, nên để uuid cho khỏe
    @Column({ type: 'uuid', nullable: true })
    refId?: string;

    // Nếu phát sinh từ 1 item trong chứng từ (vd: phiếu nhập, xuất,...)
    @Column('uuid', { nullable: true })
    refItemId?: string;

    @Column({ type: 'text', nullable: true })
    note?: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'performed_by_id' })
    performedBy?: User;
}
