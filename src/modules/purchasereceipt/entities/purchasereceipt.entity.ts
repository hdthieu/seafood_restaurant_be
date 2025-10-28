import { InventoryItem } from "@modules/inventoryitems/entities/inventoryitem.entity";
import { PurchaseReceiptItem } from "@modules/purchasereceiptitem/entities/purchasereceiptitem.entity";
import { Supplier } from "@modules/supplier/entities/supplier.entity";
import { User } from "@modules/user/entities/user.entity";
import { DiscountType, ReceiptStatus } from "src/common/enums";
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
@Entity('purchase_receipts')
@Index(['supplier', 'receiptDate'])
@Index(['status', 'receiptDate'])
@Unique(['code'])
@Check(`("globalDiscountType" <> 'PERCENT') OR ("globalDiscountValue" BETWEEN 0 AND 100)`)
@Check(`"shippingFee" >= 0`)
@Check(`"amountPaid" >= 0`)
export class PurchaseReceipt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    code: string;

    @ManyToOne(() => Supplier, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'supplier_id' })
    supplier: Supplier;

    @Column({ type: 'date' })
    receiptDate: string;

    @OneToMany(() => PurchaseReceiptItem, i => i.receipt, { cascade: true })
    items: PurchaseReceiptItem[];

    @Column({ type: 'enum', enum: ReceiptStatus, default: ReceiptStatus.DRAFT })
    status: ReceiptStatus;

    @Column({ type: 'enum', enum: DiscountType, default: DiscountType.AMOUNT })
    globalDiscountType: DiscountType;

    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    globalDiscountValue: number;

    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    shippingFee: number;

    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    amountPaid: number;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User;

    // field nợ
    @Check(`"debt" >= 0`)
    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    debt: number;
}

