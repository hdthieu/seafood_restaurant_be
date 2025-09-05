import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category, CategoryType } from '../category/entities/category.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { RestaurantTable } from '../restauranttable/entities/restauranttable.entity';
import { User } from '../user/entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';
import { Area } from '../area/entities/area.entity';

import { UserStatus, UserRole, InventoryAction } from 'src/common/enums';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SeederService.name);

    constructor(
        @InjectRepository(Category)
        private readonly CategoryRepo: Repository<Category>,

        @InjectRepository(MenuItem)
        private readonly menuItemRepo: Repository<MenuItem>,

        @InjectRepository(InventoryItem)
        private readonly inventoryItemRepo: Repository<InventoryItem>,

        @InjectRepository(RestaurantTable)
        private readonly tableRepo: Repository<RestaurantTable>,

        @InjectRepository(User)
        private readonly userRepo: Repository<User>,

        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,

        @InjectRepository(Ingredient)
        private readonly IngredientRepo: Repository<Ingredient>,

        @InjectRepository(InventoryTransaction)
        private readonly inventoryTransactionRepo: Repository<InventoryTransaction>,

        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    async onApplicationBootstrap() {
        this.logger.log('🌱 Bắt đầu seed dữ liệu...');

        // 0) Areas
        const areaCount = await this.areaRepo.count();
        if (areaCount === 0) {
            const areas = this.areaRepo.create([
                { name: 'Lầu 1', note: 'Khu vực tầng 1' },
                { name: 'Lầu 2', note: 'Khu vực tầng 2' },
            ]);
            await this.areaRepo.save(areas);
            this.logger.log('✅ Seeded Areas');
        }

        // 1) Menu Categories
        const categoryCount = await this.CategoryRepo.count();
        if (categoryCount === 0) {
            const categories = this.CategoryRepo.create([
                { name: 'Đồ uống', type: CategoryType.MENU },
                { name: 'Hải sản', type: CategoryType.MENU },
            ]);
            await this.CategoryRepo.save(categories);
            this.logger.log('✅ Seeded Categories');
        }

        // 2) Inventory Items
        const inventoryCount = await this.inventoryItemRepo.count();
        if (inventoryCount === 0) {
            const inventoryItems = this.inventoryItemRepo.create([
                { name: 'Tôm sú', unit: 'kg', quantity: 100, alertThreshold: 10 },
                { name: 'Bia Heineken', unit: 'chai', quantity: 200, alertThreshold: 20 },
            ]);
            await this.inventoryItemRepo.save(inventoryItems);
            this.logger.log('✅ Seeded Inventory Items');
        }

        // 3) Menu Items
        const itemCount = await this.menuItemRepo.count();
        if (itemCount === 0) {
            const categories = await this.CategoryRepo.find();
            const items = this.menuItemRepo.create([
                {
                    name: 'Bia Heineken',
                    price: 30000,
                    category: categories.find((c) => c.name === 'Đồ uống')!,
                    isAvailable: true,
                },
                {
                    name: 'Tôm hấp bia',
                    price: 125000,
                    category: categories.find((c) => c.name === 'Hải sản')!,
                    isAvailable: true,
                },
            ]);
            await this.menuItemRepo.save(items);
            this.logger.log('✅ Seeded Menu Items');
        }

        // 4) Tables (tham chiếu Area)
        const tableCount = await this.tableRepo.count();
        if (tableCount === 0) {
            const lau1 = await this.areaRepo.findOne({ where: { name: 'Lầu 1' } });
            if (!lau1) {
                this.logger.warn('⚠️ Không tìm thấy Area "Lầu 1" để seed bàn.');
            } else {
                const tables = this.tableRepo.create([
                    { name: 'Bàn 1', seats: 4, area: lau1 },
                    { name: 'Bàn 2', seats: 4, area: lau1 },
                ]);
                await this.tableRepo.save(tables);
                this.logger.log('✅ Seeded Tables');
            }
        }

        // 5) Admin User + Profile
        const userCount = await this.userRepo.count();
        if (userCount === 0) {
            const hashedPassword = await bcrypt.hash('Admin123@', 10);
            const user = this.userRepo.create({
                email: 'admin@restaurant.com',
                password: hashedPassword,
                role: UserRole.MANAGER,
                status: UserStatus.ACTIVE,
                isActive: true,
            });
            const savedUser = await this.userRepo.save(user);

            const profile = this.profileRepo.create({
                fullName: 'Quản lý hệ thống',
                user: savedUser,
                address: 'Nhà hàng Hải sản ABC',
                city: 'Hồ Chí Minh',
            });
            await this.profileRepo.save(profile);

            this.logger.log('✅ Seeded Admin User: admin@restaurant.com / admin123');
        }

        // 6) Menu Item Ingredients
        const ingredientCount = await this.IngredientRepo.count();
        if (ingredientCount === 0) {
            const menuItems = await this.menuItemRepo.find({ relations: ['category'] });
            const inventoryItems = await this.inventoryItemRepo.find();

            const tom = inventoryItems.find((i) => i.name.includes('Tôm'));
            const bia = inventoryItems.find((i) => i.name.includes('Bia'));
            const tomHapBia = menuItems.find((i) => i.name.includes('Tôm hấp bia'));

            if (tom && bia && tomHapBia) {
                const ingredients = this.IngredientRepo.create([
                    {
                        menuItem: tomHapBia,
                        inventoryItem: tom,
                        quantity: 0.3,
                        note: 'Tôm sú tươi sống',
                    },
                    {
                        menuItem: tomHapBia,
                        inventoryItem: bia,
                        quantity: 1,
                        note: 'Bia Heineken lon',
                    },
                ]);
                await this.IngredientRepo.save(ingredients);
                this.logger.log('✅ Seeded Menu Item Ingredients');
            } else {
                this.logger.warn('⚠️ Không đủ dữ liệu để seed nguyên liệu món ăn');
            }
        }

        // 7) Inventory Transactions
        const transactionCount = await this.inventoryTransactionRepo.count();
        if (transactionCount === 0) {
            const inventoryItems = await this.inventoryItemRepo.find();
            const tTomSu = inventoryItems.find((i) => i.name === 'Tôm sú');
            const tHeineken = inventoryItems.find((i) => i.name === 'Bia Heineken');
            const user = await this.userRepo.findOne({
                where: { email: 'admin@restaurant.com' },
            });

            if (!tTomSu || !tHeineken || !user) {
                this.logger.warn('⚠️ Không đủ dữ liệu để seed Inventory Transactions');
            } else {
                const transactions = this.inventoryTransactionRepo.create([
                    {
                        item: tTomSu,
                        quantity: 50,
                        action: InventoryAction.IMPORT,
                        note: 'Nhập kho đầu kỳ',
                        performedBy: user,
                    },
                    {
                        item: tHeineken,
                        quantity: 100,
                        action: InventoryAction.IMPORT,
                        note: 'Nhập kho đầu kỳ',
                        performedBy: user,
                    },
                ]);
                await this.inventoryTransactionRepo.save(transactions);
                this.logger.log('✅ Seeded Inventory Transactions');
            }
        }

        this.logger.log('🎉 Seeder hoàn tất.');
    }
}
