// src/modules/branch/entities/branch.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 160 }) name: string;                 // "Chi nhánh trung tâm"
  @Column({ length: 50, unique: true }) code: string;    // "CENTER"
  @Column({ default: false }) isDefault: boolean;        // <— thêm cột này

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
