import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum CategoryType { MENU = 'MENU', INGREDIENT = 'INGREDIENT' }

@Entity('categories')
@Index(['name', 'type'], { unique: true })
export class Category {
    @PrimaryGeneratedColumn('uuid') id: string;

    @Column() name: string;
    @Column({ nullable: true }) description?: string;

    // thêm default để bản ghi mới không bị null
    @Column({ type: 'enum', enum: CategoryType, default: CategoryType.MENU })
    type: CategoryType;

    @Column({ default: true }) isActive: boolean;
    @Column({ default: 0 }) sortOrder: number;

    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
