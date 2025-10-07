// src/modules/user/entities/work-schedule.entity.ts
import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Shift } from './shift.entity';

@Entity('work_schedules')
@Unique('UQ_user_date_shift', ['user', 'date', 'shift'])
@Index('IDX_user_date', ['user', 'date'])
export class WorkSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Shift, { nullable: false, onDelete: 'CASCADE' })
  shift: Shift;

  // Lịch cho NGÀY (YYYY-MM-DD). Lưu kiểu date để query tuần nhanh.
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string;

  // Nếu tạo từ “lặp hằng tuần”, gom nhóm để xoá/cập nhật đồng bộ nếu cần
  @Column({ type: 'uuid', nullable: true })
  repeatGroupId?: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
