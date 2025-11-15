import { Supplier } from "@modules/supplier/entities/supplier.entity";
import { InventoryItem } from "src/modules/inventoryitems/entities/inventoryitem.entity";
import { MenuItem } from "src/modules/menuitems/entities/menuitem.entity";
import { UnitsOfMeasure } from "@modules/units-of-measure/entities/units-of-measure.entity";
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

    // Đơn vị người dùng chọn khi khai báo định lượng (không bắt buộc)
    @ManyToOne(() => UnitsOfMeasure, { nullable: true })
    @JoinColumn({ name: 'selected_uom_code', referencedColumnName: 'code' })
    selectedUom?: UnitsOfMeasure | null;

    // Số lượng theo đơn vị đã chọn (lưu để hiển thị/biên tập), quantity ở trên luôn quy đổi về base
    @Column('numeric', { precision: 12, scale: 3, nullable: true, name: 'selected_qty' })
    selectedQty?: number | null;

    @Column({ type: 'text', nullable: true, default: null })
    note?: string | null;
}