// src/modules/payroll/entities/salary-setting.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from '@modules/user/entities/user.entity';
import { SalaryType } from 'src/common/enums';

@Entity('salary_settings')
@Unique(['staff'])
export class SalarySetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'staff_id' })
  staff: User;

  @Column({ type: 'enum', enum: SalaryType })
  salaryType: SalaryType;

  // mức lương cơ bản theo loại
  @Column('decimal', { precision: 14, scale: 2 })
  baseAmount: string; // lương theo ca / giờ / kỳ lương

  // option: lương OT tính riêng
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  overtimeRate: string; // tiền / giờ OT

  // sau này bổ sung: default bonus/allowance/deduction template
   // salary-setting.entity.ts
@Column({
  type: 'jsonb',
  nullable: true,
  default: () => "'{}'",
})
meta?: SalaryMeta | null;
}

// Định nghĩa interface cho meta
export type SalaryMeta = {
  // === THƯỞNG THEO DOANH THU ===
  bonusEnabled?: boolean;
  bonusType?: 'PERSONAL_REVENUE';    // sau này có thể thêm TEAM_REVENUE
  bonusCalcMode?: 'TOTAL_REVENUE_PERCENT'; // giống “Tính theo mức tổng doanh thu”
  bonusRules?: {
    label: string;       // “Tư vấn bán hàng”
    fromRevenue: number; // Doanh thu từ ...
    percent: number;     // % doanh thu
  }[];

  // === PHỤ CẤP ===
  allowanceEnabled?: boolean;
  allowances?: {
    name: string; // “Phụ cấp ăn trưa”
    type: 'PER_DAY_FIXED' | 'PER_MONTH_FIXED';
    amount: number; // số tiền mỗi ngày / mỗi tháng
  }[];

  // === GIẢM TRỪ ===
  deductionEnabled?: boolean;
  deductions?: {
    name: string; // “Đi muộn”, “Vi phạm nội quy”
    type: 'BY_TIMES' | 'FIXED_PER_DAY' | 'FIXED_PER_MONTH';
    amountPerUnit: number; // tiền phạt mỗi lần / mỗi ngày
  }[];
};
