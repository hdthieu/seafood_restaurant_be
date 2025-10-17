// cashbook/entities/cash_other_party.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('cash_other_parties')
export class CashOtherParty {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone?: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    address?: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    ward?: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    district?: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    province?: string | null;

    @Column({ type: 'text', nullable: true })
    note?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
