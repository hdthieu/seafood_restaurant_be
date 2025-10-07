// src/modules/shift/entities/shift.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  // Lưu HH:mm cho đơn giản (khỏi map timezone phức tạp)
  @Column({ type: 'varchar', length: 5 })
  startTime: string; // "08:00"

  @Column({ type: 'varchar', length: 5 })
  endTime: string;   // "17:00"

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  color?: string; // ví dụ "#22c55e"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
