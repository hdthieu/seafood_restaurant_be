export class CreateMenuItemDto {
    name: string;
    price: number;
    description?: string;
    image?: string;
    categoryId: string;

    ingredients: {
        inventoryItemId: string;
        quantity: number;
        note?: string;
    }[];
}
