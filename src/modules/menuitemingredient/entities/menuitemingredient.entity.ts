import { InventoryItem } from "src/modules/inventoryitems/entities/inventoryitem.entity";
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('menu_item_ingredients')
export class MenuItemIngredient {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => MenuItem, (item) => item.ingredients, { onDelete: 'CASCADE' })
    menuItem: MenuItem;

    @ManyToOne(() => InventoryItem)
    inventoryItem: InventoryItem;

    @Column('decimal')
    quantity: number; // Lượng nguyên liệu dùng cho 1 món (vd: 0.2kg, 50ml,...)

    @Column({ nullable: true })
    note: string; // tùy chọn ghi chú
}
