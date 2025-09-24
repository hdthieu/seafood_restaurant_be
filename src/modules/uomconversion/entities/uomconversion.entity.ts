import { UnitsOfMeasure } from "@modules/units-of-measure/entities/units-of-measure.entity";
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('uom_conversions')
@Unique(['from', 'to'])
@Check(`"factor" > 0`)
export class UomConversion {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => UnitsOfMeasure)
    @JoinColumn({ name: 'from_code', referencedColumnName: 'code' })
    from: UnitsOfMeasure;

    @ManyToOne(() => UnitsOfMeasure)
    @JoinColumn({ name: 'to_code', referencedColumnName: 'code' })
    to: UnitsOfMeasure;

    // 1 from = factor * to
    @Column('numeric', { precision: 12, scale: 6 })
    factor: number;
}
