import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Index,
    Check,
} from 'typeorm';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { User } from '@modules/user/entities/user.entity';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
import { PurchaseReturn } from './purchasereturn.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
@Entity('purchase_return_logs')
@Index(['item', 'performedAt'])
@Check(`"quantity" > 0`)
@Check(`"baseQty" > 0`)
@Check(`"unitPrice" >= 0`)
@Check(`"lineTotalBeforeDiscount" >= 0`)
@Check(`"globalDiscountAllocated" >= 0`)
@Check(`"lineTotalAfterDiscount" >= 0`)
@Check(`"refundAmount" >= 0`)
@Index(['purchaseReturn'])
@Index(['purchaseReturn', 'performedAt'])
export class PurchaseReturnLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => PurchaseReturn, (ret) => ret.logs, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchase_return_id' })
    purchaseReturn: PurchaseReturn;

    @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    item: InventoryItem;

    /** Số lượng trả (đơn vị dòng = đơn vị user chọn) */
    @Column('numeric', { precision: 12, scale: 3 })
    quantity: number;

    /** Hệ số quy đổi sang đơn vị base (VD: thùng→lon) */
    @Column('numeric', { precision: 12, scale: 6 })
    conversionToBase: number;

    /** Số lượng base thực xuất kho (OUT) */
    @Column('numeric', { precision: 12, scale: 3 })
    baseQty: number;

    @Column({ type: 'text', nullable: true })
    reason?: string;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    unitPrice: number;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    lineTotalBeforeDiscount: number;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    globalDiscountAllocated: number;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    lineTotalAfterDiscount: number;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    refundAmount: number;

    @ManyToOne(() => InventoryTransaction, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'inventory_tx_id' })
    inventoryTx?: InventoryTransaction | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'performed_by_id' })
    performedBy?: User | null;

    @CreateDateColumn({ type: 'timestamptz' })
    performedAt: Date;

    // Đơn vị user chọn lúc trả
    @ManyToOne(() => UnitsOfMeasure)
    @JoinColumn({ name: 'uom_code', referencedColumnName: 'code' })
    uom: UnitsOfMeasure;
}
