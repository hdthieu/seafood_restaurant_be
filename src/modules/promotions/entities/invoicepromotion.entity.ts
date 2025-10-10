import {
    Check, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
    PrimaryGeneratedColumn, Unique, Column
} from 'typeorm';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { Promotion } from './promotion.entity';
import { ApplyWith } from 'src/common/enums';
import { AudienceRules } from './promotion.entity';

@Entity('invoice_promotions')
@Unique(['invoice', 'promotion'])
@Index(['invoice'])
@Index(['promotion'])
@Index(['createdAt'])
@Check(`"calculationBase" >= 0`)
@Check(`"discountAmount" >= 0`)
export class InvoicePromotion {
    @PrimaryGeneratedColumn('uuid') id: string;

    @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @ManyToOne(() => Promotion, { onDelete: 'RESTRICT', eager: true })
    @JoinColumn({ name: 'promotion_id' })
    promotion: Promotion;

    // Phạm vi áp dụng tại thời điểm áp (không phụ thuộc thay đổi sau đó của KM) 
    @Column({ type: 'enum', enum: ApplyWith })
    applyWith: ApplyWith;                         // ORDER | CATEGORY | ITEM

    // Nền tính giảm giá của chương trình khuyến mãi
    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    calculationBase: number;

    // Số tiền giảm giá thực tế
    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    discountAmount: number;

    // Số quà tặng (nếu KM là GIFT) - để mở rộng
    @Column({ type: 'int', default: 0 })
    giftsCount: number;

    // Nếu KM yêu cầu mã, lưu mã đã dùng để audit
    @Column({ type: 'varchar', length: 32, nullable: true })
    codeUsed: string | null;

    // điều kiện đối tượng khớp thời điểm áp dụng KM
    @Column({ type: 'jsonb', nullable: true })
    audienceMatched: Partial<AudienceRules> | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
