import {
  Check, Column, CreateDateColumn, Entity, Index, JoinTable,
  ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn, Unique
} from 'typeorm';
import { Category } from '@modules/category/entities/category.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import {
  ApplyWith,
  AudienceScope,
  DiscountTypePromotion,
} from 'src/common/enums';

// Điều kiện đối tượng/hoàn cảnh áp dụng (không dính payment)
export type AudienceRules = {
  scope?: AudienceScope;        // ALL | POINTS | BIRTHDAY | COMPANY | NEW
  pointsMin?: number;           // ngưỡng điểm tối thiểu (khi scope=POINTS)
  birthdayMonth?: boolean;      // true = theo THÁNG sinh nhật; false/undefined = đúng NGÀY
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
  guestCountMin?: number;
  guestCountMax?: number | null;
};

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
  discountTypePromotion: DiscountTypePromotion; // PERCENT | AMOUNT | ...

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  discountValue: number;

  // Trần giảm tối đa; null nếu không giới hạn
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: number | null;

  // Điều kiện tối thiểu trên hóa đơn
  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  minOrderAmount: number;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endAt: Date | null;

  // Phạm vi áp (Order/Cat/Item) để tính nền giảm
  @Column({ type: 'enum', enum: ApplyWith })
  applyWith: ApplyWith;

  // Điều kiện đối tượng & thời điểm tại nhà hàng (JSONB)
  @Column({ type: 'jsonb', nullable: true })
  audienceRules: AudienceRules | null;

  @Column({ type: 'varchar', length: 32, nullable: false })
  promotionCode: string;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: false })
  stackable: boolean;              // có cộng dồn với KM khác không

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Liên kết phạm vi áp dụng theo danh mục/món
  @ManyToMany(() => Category, { eager: true })
  @JoinTable({
    name: 'promotion_categories',
    joinColumn: { name: 'promotion_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories?: Category[];

  @ManyToMany(() => MenuItem, { eager: true })
  @JoinTable({
    name: 'promotion_items',
    joinColumn: { name: 'promotion_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'item_id', referencedColumnName: 'id' },
  })
  items?: MenuItem[]
}
