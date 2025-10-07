import { ApplyWith, DiscountTypePromotion, PromotionRules, Target } from "src/common/enums";
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('promotions')
@Index(['isActive', 'startAt', 'endAt'])
@Check(`"discountValue" >= 0`)
@Check(`"minOrderAmount" >= 0`)
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'enum', enum: DiscountTypePromotion })
  discountTypePromotion: DiscountTypePromotion;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  discountValue: number;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: number | null;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  minOrderAmount: number;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endAt: Date | null;

  @Column({ type: 'enum', enum: ApplyWith })
  applyWith: ApplyWith; // ORDER | CATEGORY | ITEM

  @Column({ type: 'jsonb', nullable: true })
  targets: Target[] | null; // khi CATEGORY/ITEM/TABLE/AREA

  @Column({ type: 'jsonb', nullable: true })
  rules: PromotionRules | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  stackable: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
