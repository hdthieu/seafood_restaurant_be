// src/modules/payroll/entities/salary-setting.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '@modules/user/entities/user.entity';
import { SalaryType } from 'src/common/enums';

// ====== TYPES cho meta ======

export type BonusRule = {
  label?: string;       // “Tư vấn bán hàng” (optional)
  fromRevenue: number;  // Doanh thu từ ...
  percent: number;      // % doanh thu
};

export type AllowanceRule = {
  name: string; // “Phụ cấp ăn trưa”
  type: 'PER_DAY_FIXED' | 'PER_MONTH_FIXED';
  amount: number;
};

export type DeductionRule = {
  name: string; // “Đi muộn quá 15p”
  // Loại giảm trừ
  kind: 'LATE' | 'EARLY' | 'FIXED';
  // Điều kiện
  condition: 'BY_TIMES' | 'BY_BLOCK';
  // dùng khi condition = BY_BLOCK (phạt theo block X phút)
  blockMinutes?: number | null;
  // tiền phạt cho 1 lần / 1 block / 1 kỳ (tùy condition + kind)
  amountPerUnit: number;
};

export type SalaryMeta = {
  // === THƯỞNG THEO DOANH THU ===
  bonusEnabled?: boolean;
  bonusType?: 'PERSONAL_REVENUE'; // sau này có thể thêm TEAM_REVENUE
  bonusCalcMode?: 'TOTAL_REVENUE_PERCENT';
  bonusRules?: BonusRule[];

  // === PHỤ CẤP ===
  allowanceEnabled?: boolean;
  allowances?: AllowanceRule[];

  // === GIẢM TRỪ ===
  deductionEnabled?: boolean;
  deductions?: DeductionRule[];
};

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

  // meta: bonus / allowance / deduction
  @Column({
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'",
  })
  meta?: SalaryMeta | null;
}
