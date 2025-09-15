import { InventoryItem } from "@modules/inventoryitems/entities/inventoryitem.entity";
import { PurchaseReceiptItem } from "@modules/purchasereceiptitem/entities/purchasereceiptitem.entity";
import { Supplier } from "@modules/supplier/entities/supplier.entity";
import { ReceiptStatus } from "src/common/enums";
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('purchase_receipts')
@Index(['receiptDate'])
export class PurchaseReceipt {
    @PrimaryGeneratedColumn('uuid') 
    id: string;

    @Column({ unique: true }) 
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

    @Column({ type: 'text', nullable: true }) note?: string;

    @CreateDateColumn({ type: 'timestamptz' }) 
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' }) 
    updatedAt: Date;
}
