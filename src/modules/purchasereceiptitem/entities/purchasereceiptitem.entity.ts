import { InventoryItem } from "@modules/inventoryitems/entities/inventoryitem.entity";
import { PurchaseReceipt } from "@modules/purchasereceipt/entities/purchasereceipt.entity";
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('purchase_receipt_items')
@Check(`"quantity" > 0`)
@Check(`"unitPrice" >= 0`)
export class PurchaseReceiptItem {
    @PrimaryGeneratedColumn('uuid') id: string;

    @ManyToOne(() => PurchaseReceipt, r => r.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'receipt_id' })
    receipt: PurchaseReceipt;

    @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    item: InventoryItem;

    @Column('numeric', { precision: 12, scale: 3 })
    quantity: number;

    @Column('numeric', { precision: 12, scale: 2 })
    unitPrice: number;

    // Không lưu lineTotal; khi cần: lineTotal = quantity * unitPrice (truy vấn/tính server)
    @Column({ type: 'text', nullable: true }) note?: string;
}