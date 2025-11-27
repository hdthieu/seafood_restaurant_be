import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    Check,
    Unique,
} from 'typeorm';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { User } from '@modules/user/entities/user.entity';
import { PurchaseReturnLog } from './purchasereturnlog.entity';
import { PurchaseReturnStatus } from 'src/common/enums';

@Entity('purchase_returns')
@Index(['supplier', 'createdAt'])
@Index(['status', 'createdAt'])
@Unique(['code'])
@Check(`"totalGoods" >= 0`)
@Check(`"discount" >= 0`)
@Check(`"totalAfterDiscount" >= 0`)
@Check(`"paidAmount" >= 0`)
@Check(`"paidAmount" <= "refundAmount"`)
export class PurchaseReturn {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Mã phiếu trả (VD: THN00001) */
    @Column()
    code: string;

    /** NCC của phiếu trả */
    @ManyToOne(() => Supplier, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'supplier_id' })
    supplier: Supplier;

    /** Tổng tiền hàng trước giảm (tổng các dòng) */
    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    totalGoods: number;

    /** Giảm giá mức phiếu (UI “Giảm giá”) */
    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    discount: number;

    /** Tổng sau giảm giá (chưa tính VAT/ship nếu có) */
    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    totalAfterDiscount: number;

    /** Số tiền NCC cần hoàn/ghi có (thường = totalAfterDiscount) */
    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    refundAmount: number;

    /** Trạng thái phiếu */
    @Column({ type: 'enum', enum: PurchaseReturnStatus, default: PurchaseReturnStatus.POSTED })
    status: PurchaseReturnStatus;

    /** Ghi chú chung */
    @Column({ type: 'text', nullable: true })
    note?: string;

    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    paidAmount: number;

    /** Số tiền nợ (refundAmount - paidAmount) */
    @Column('numeric', { precision: 14, scale: 2, default: 0 })
    debt: number;

    /** Người tạo phiếu */
    @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    /** Danh sách dòng trả (log chi tiết) */
    @OneToMany(() => PurchaseReturnLog, (log) => log.purchaseReturn, { cascade: true })
    logs: PurchaseReturnLog[];
}
