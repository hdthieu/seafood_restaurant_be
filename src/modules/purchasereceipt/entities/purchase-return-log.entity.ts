import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PurchaseReceipt } from './purchasereceipt.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { User } from '@modules/user/entities/user.entity';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { ReturnMode } from 'src/common/enums';


@Entity('purchase_return_logs')
export class PurchaseReturnLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => PurchaseReceipt, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'receipt_id' })
    receipt?: PurchaseReceipt | null;

    @ManyToOne(() => PurchaseReceiptItem, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'receipt_item_id' })
    receiptItem?: PurchaseReceiptItem | null;

    @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    item: InventoryItem;

    // dùng để ghi nhận số lượng trả về (thuộc đơn vị của item)
    @Column('numeric', { precision: 12, scale: 3 })
    quantity: number;

    // dùng để ghi nhận số lượng trả về (quy đổi về đơn vị BASE)
    @Column('numeric', { precision: 12, scale: 6 })
    conversionToBase: number;

    // số lượng cơ sở ban đầu của item khi trả (VD: nếu trả 2 thùng, mỗi thùng 24 lon, baseQty = 48)
    @Column('numeric', { precision: 12, scale: 3 })
    baseQty: number;

    @Column({ type: 'text', nullable: true })
    reason?: string;

    @Column({ nullable: true })
    lotNumber?: string;

    @ManyToOne(() => InventoryTransaction, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'inventory_tx_id' })
    inventoryTx?: InventoryTransaction | null;

    @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'supplier_id' })
    supplier?: Supplier | null;

    @Column({ type: 'enum', enum: ReturnMode, default: ReturnMode.BY_RECEIPT })
    mode: ReturnMode;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'performed_by_id' })
    performedBy?: User | null;

    @CreateDateColumn({ type: 'timestamptz' })
    performedAt: Date;
}
