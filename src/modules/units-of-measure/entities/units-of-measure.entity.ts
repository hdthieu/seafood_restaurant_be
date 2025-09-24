import { Column, Entity, PrimaryColumn } from "typeorm";
@Entity('units_of_measure')
export class UnitsOfMeasure {
    @PrimaryColumn({ length: 32 })
    code: string;                       // 'KG','G','L','ML','EA','CAN',...

    @Column({ length: 64 })
    name: string;                       // 'Kilogram','Gram','Litre','...'

    @Column({ type: 'enum', enum: ['mass', 'volume', 'count', 'length'] })
    dimension: 'mass' | 'volume' | 'count' | 'length';
}
