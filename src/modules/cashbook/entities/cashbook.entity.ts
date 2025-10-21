import {
    Entity, PrimaryGeneratedColumn, Column, Unique, ManyToOne, JoinColumn,
    CreateDateColumn, Check, Index,
    UpdateDateColumn
} from 'typeorm';
import { CashType } from './cash_types.entity';
import { Customer } from '@modules/customers/entities/customers.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity'; // kiểm tra lại path
import { CashbookType, CounterpartyGroup } from 'src/common/enums';
import { CashOtherParty } from './cash_other_party';

@Entity('cashbook_entries')
@Unique(['code'])
@Index(['date'])
@Check(`((invoice_id IS NOT NULL)::int + (purchase_receipt_id IS NOT NULL)::int) <= 1`)
export class CashbookEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: CashbookType })
    type: CashbookType;

    @Column()
    code: string;

    @Column({ type: 'timestamp' })
    date: Date;

    @ManyToOne(() => CashType, { eager: true })
    @JoinColumn({ name: 'cash_type_id' })
    cashType: CashType;

    @Column('decimal', { precision: 14, scale: 2 })
    amount: string;

    @Column({ default: true })
    isPostedToBusinessResult: boolean;

    @Column({ name: 'counterparty_group', type: 'enum', enum: CounterpartyGroup })
    counterpartyGroup: CounterpartyGroup;

    // ===== Đối tượng nộp/nhận =====
    @ManyToOne(() => Customer, { nullable: true, eager: true })
    @JoinColumn({ name: 'customer_id' })
    customer?: Customer | null;

    @ManyToOne(() => Supplier, { nullable: true, eager: true })
    @JoinColumn({ name: 'supplier_id' })
    supplier?: Supplier | null;

    @ManyToOne(() => CashOtherParty, { nullable: true, eager: true })
    @JoinColumn({ name: 'cash_other_party_id' })
    cashOtherParty?: CashOtherParty | null;

    // ===== Nguồn chứng từ (nếu có) =====
    @ManyToOne(() => Invoice, { nullable: true })
    @JoinColumn({ name: 'invoice_id' })
    invoice?: Invoice | null;

    @ManyToOne(() => PurchaseReceipt, { nullable: true })
    @JoinColumn({ name: 'purchase_receipt_id' })
    purchaseReceipt?: PurchaseReceipt | null;

    @Column({ name: 'source_code', nullable: true })
    sourceCode?: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
