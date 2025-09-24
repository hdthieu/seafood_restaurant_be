import { Supplier } from "@modules/supplier/entities/supplier.entity";
import { InventoryItem } from "src/modules/inventoryitems/entities/inventoryitem.entity";
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('ingredients')
@Unique(['menuItem', 'inventoryItem'])
export class Ingredient {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => MenuItem, (item) => item.ingredients, { onDelete: 'CASCADE' })
    menuItem: MenuItem;

    @ManyToOne(() => InventoryItem)
    inventoryItem: InventoryItem;

    @Check(`"quantity" > 0`)
    @Column('numeric', { precision: 12, scale: 3 })
    quantity: number; // theo base unit của inventoryItem

    @Column({ type: 'text', nullable: true, default: null })
    note?: string | null;
}