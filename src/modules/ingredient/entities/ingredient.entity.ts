import { Supplier } from "@modules/supplier/entities/supplier.entity";
import { InventoryItem } from "src/modules/inventoryitems/entities/inventoryitem.entity";
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('ingredients')
@Unique(['menuItem', 'inventoryItem'])
export class Ingredient {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => MenuItem, (item) => item.ingredients, { onDelete: 'CASCADE' })
    menuItem: MenuItem;

    @ManyToOne(() => InventoryItem)
    inventoryItem: InventoryItem;

    @Column('numeric')
    quantity: number; // Lượng nguyên liệu dùng cho 1 món (vd: 0.2kg, 50ml,...)

    @Column({ nullable: true })
    note: string; // tùy chọn ghi chú

    @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'preferred_supplier_id' })
    preferredSupplier?: Supplier | null;
}