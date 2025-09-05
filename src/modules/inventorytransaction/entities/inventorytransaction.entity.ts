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


@Entity('inventory_transactions')
@Index(['item', 'createdAt'])                 // tra cứu giao dịch 1 mặt hàng theo thời gian
@Check(`"quantity" > 0`)                      // luôn lưu số dương; tăng/giảm do action quyết định
export class InventoryTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Bảo vệ lịch sử: không cho xóa InventoryItem nếu đã có giao dịch
    @ManyToOne(() => InventoryItem, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    item: InventoryItem;

    // Số lượng biến động (luôn là số dương). Dùng 12,3 để hỗ trợ gram/ml
    @Column({ type: 'decimal', precision: 12, scale: 3 })
    quantity: number;

    @Column({ type: 'enum', enum: InventoryAction })
    action: InventoryAction;

    // Audit tồn trước/sau giao dịch để truy vết nhanh
    @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
    beforeQty?: number;

    @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
    afterQty?: number;

    // Gốc phát sinh (polymorphic ref) để backtrace chứng từ
    // Ví dụ: refType='RECEIPT' | 'ORDER_ITEM' | 'ADJUSTMENT'
    @Column({ type: 'varchar', length: 50, nullable: true })
    refType?: string;

    @Column({ type: 'varchar', length: 64, nullable: true })
    refId?: string;

    @Column({ type: 'text', nullable: true })
    note?: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    // Ai thực hiện giao dịch; để null nếu chạy tự động từ hệ thống
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'performed_by_id' })
    performedBy?: User;
}
