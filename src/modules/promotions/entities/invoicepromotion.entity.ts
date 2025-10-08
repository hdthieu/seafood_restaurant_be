import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { ApplyWith } from 'src/common/enums';
import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column, Unique, Index, CreateDateColumn, Check } from 'typeorm';
import { Promotion } from './promotion.entity';

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

    // Phạm vi áp dụng tại thời điểm áp (snapshot) – giúp group nhanh mà không JOIN
    @Column({ type: 'enum', enum: ApplyWith })
    applyWith: ApplyWith;                         // ORDER | CATEGORY | ITEM

    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    calculationBase: number; // Nền tính giảm giá của chương trình khuyến mãi

    // Số tiền giảm giá thực tế được áp dụng từ chương trình khuyến mãi
    @Column('numeric', { precision: 12, scale: 2, default: 0 })
    discountAmount: number;

    // Số quà tặng (nếu KM là GIFT)
    @Column({ type: 'int', default: 0 })
    giftsCount: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}