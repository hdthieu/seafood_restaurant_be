import { InventoryItem } from "@modules/inventoryitems/entities/inventoryitem.entity";
import { PurchaseReceipt } from "@modules/purchasereceipt/entities/purchasereceipt.entity";
import { DiscountType } from "src/common/enums";
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('purchase_receipt_items')
@Check(`"quantity" > 0`)
@Check(`"unitPrice" >= 0`)
@Check(`("discountType" <> 'PERCENT') OR ("discountValue" BETWEEN 0 AND 100)`)
@Check(`"conversionToBase" > 0`)
@Unique(['receipt', 'item', 'lotNumber', 'unitPrice', 'receivedUnit', 'conversionToBase'])
export class PurchaseReceiptItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseReceipt, r => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  @Index()
  receipt: PurchaseReceipt;

  @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  @Index()
  item: InventoryItem;

  // Số lượng theo đơn vị NHẬN (receivedUnit)
  @Column('numeric', { precision: 12, scale: 3 })
  quantity: number;

  // Đơn vị nhận (vd: kg, thùng). Nếu trùng base unit có thể để null.
  @Column({ nullable: true })
  receivedUnit?: string;

  // 1 receivedUnit = conversionToBase * baseUnit
  @Column('numeric', { precision: 12, scale: 6, default: 1 })
  conversionToBase: number;

  @Column('numeric', { precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'enum', enum: DiscountType, default: DiscountType.AMOUNT })
  discountType: DiscountType;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  discountValue: number;

  // Thông tin lô – HSD (tuỳ dùng cho thực phẩm tươi)
  @Column({ nullable: true })
  lotNumber?: string;

  @Column({ type: 'date', nullable: true })
  expiryDate?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;
}
