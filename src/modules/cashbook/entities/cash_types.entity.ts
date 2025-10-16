import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('cash_types')
export class CashType {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ default: true })
    isIncomeType: boolean;

    @Column({ default: true })
    isActive: boolean;
}

