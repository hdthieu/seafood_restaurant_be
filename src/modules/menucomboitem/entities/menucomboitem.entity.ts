import { MenuItem } from "@modules/menuitems/entities/menuitem.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('menu_combo_items')
@Unique(['combo', 'item'])
export class MenuComboItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // combo cha
    @ManyToOne(() => MenuItem, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'combo_id' })
    @Index()
    combo: MenuItem;

    // món con trong combo
    @ManyToOne(() => MenuItem, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'item_id' })
    @Index()
    item: MenuItem;

    // số lượng món con trong combo
    @Column('decimal', { precision: 12, scale: 3, default: 1 })
    quantity: number;

    // thông tin thêm (nếu cần)
    @Column({ type: 'text', nullable: true })
    note?: string;
}