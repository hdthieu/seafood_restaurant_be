// units-of-measure.entity.ts
import { Entity, PrimaryColumn, Column } from 'typeorm';


@Entity('units_of_measure')
export class UnitsOfMeasure {
    @PrimaryColumn({ length: 32 })
    code: string;

    @Column({ length: 64 })
    name: string;

    @Column({ type: 'enum', enum: ['mass', 'volume', 'count', 'length'] })
    dimension: 'mass' | 'volume' | 'count' | 'length';

    @Column({ name: 'base_code', nullable: true, length: 32, type: 'varchar' })
    baseCode?: string | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;
}