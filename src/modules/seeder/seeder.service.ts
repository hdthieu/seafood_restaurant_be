import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
export class SeederService {
    private readonly logger = new Logger(SeederService.name);

    constructor(
        @InjectRepository(Category)
        private readonly categoryRepo: Repository<Category>,

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
        private readonly ingredientRepo: Repository<Ingredient>,

        @InjectRepository(InventoryTransaction)
        private readonly inventoryTransactionRepo: Repository<InventoryTransaction>,

        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    /** Gọi hàm này từ seed.main.ts */
    async seed() {
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
        const categoryCount = await this.categoryRepo.count();
        if (categoryCount === 0) {
            const categories = this.categoryRepo.create([
                { name: 'Đồ uống', type: CategoryType.MENU },
                { name: 'Hải sản', type: CategoryType.MENU },
            ]);
            await this.categoryRepo.save(categories);
            this.logger.log('✅ Seeded Categories');
        }

        // 2) Inventory Items
        const inventoryCount = await this.inventoryItemRepo.count();
        if (inventoryCount === 0) {
            const inventoryItems = this.inventoryItemRepo.create([
                { name: 'Tôm sú', unit: 'kg', quantity: 0, alertThreshold: 10 },
                { name: 'Bia Heineken', unit: 'chai', quantity: 0, alertThreshold: 20 },
            ]);
            await this.inventoryItemRepo.save(inventoryItems);
            this.logger.log('✅ Seeded Inventory Items');
        }

        // 3) Menu Items
        const itemCount = await this.menuItemRepo.count();
        if (itemCount === 0) {
            const categories = await this.categoryRepo.find();
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
                    { name: 'Bàn 3', seats: 6, area: lau1 },
                    { name: 'Bàn 4', seats: 2, area: lau1 },
                    { name: 'Bàn 5', seats: 8, area: lau1 },
                    { name: 'Bàn 6', seats: 4, area: lau1 },
                    { name: 'Bàn 7', seats: 4, area: lau1 },
                    { name: 'Bàn 8', seats: 6, area: lau1 },
                    { name: 'Bàn 9', seats: 2, area: lau1 },
                    { name: 'Bàn 10', seats: 8, area: lau1 },
                    { name: 'Bàn 11', seats: 4, area: lau1 },
                    { name: 'Bàn 12', seats: 4, area: lau1 },
                    { name: 'Bàn 13', seats: 6, area: lau1 },
                    { name: 'Bàn 14', seats: 2, area: lau1 },
                    { name: 'Bàn 15', seats: 8, area: lau1 },
                ]);
                await this.tableRepo.save(tables);
                this.logger.log('✅ Seeded Tables');
            }
        }

        // 5) Users + Profiles (upsert theo email, không phụ thuộc count===0)
        const usersToSeed: Array<{
            email: string;
            pass: string;
            role: UserRole;
            fullName: string;
        }> = [
                { email: 'admin@restaurant.com', pass: 'Admin123@', role: UserRole.MANAGER, fullName: 'Quản lý hệ thống' },
                { email: 'cashier@restaurant.com', pass: 'Cashier123@', role: UserRole.CASHIER, fullName: 'Thu ngân' },
                { email: 'kitchen@restaurant.com', pass: 'Kitchen123@', role: UserRole.KITCHEN, fullName: 'Nhân viên bếp' },
                { email: 'waiter@restaurant.com', pass: 'Waiter123@', role: UserRole.WAITER, fullName: 'Nhân viên phục vụ' },
            ];

        for (const u of usersToSeed) {
            try {
                const exists = await this.userRepo.findOne({ where: { email: u.email } });
                if (exists) {
                    this.logger.log(`ℹ️ User đã tồn tại: ${u.email} — bỏ qua`);
                    continue;
                }

                const hashed = await bcrypt.hash(u.pass, 10);
                const user = await this.userRepo.save(
                    this.userRepo.create({
                        email: u.email,
                        password: hashed,
                        role: u.role,
                        status: UserStatus.ACTIVE,
                        isActive: true,
                    }),
                );

                await this.profileRepo.save(
                    this.profileRepo.create({
                        fullName: u.fullName,
                        user,
                        address: 'Nhà hàng Hải sản ABC',
                        city: 'Hồ Chí Minh',
                    }),
                );

                this.logger.log(`✅ Seeded ${u.role}: ${u.email} / ${u.pass}`);
            } catch (err) {
                this.logger.error(`❌ Seed user thất bại: ${u.email} — ${String(err)}`);
                // Nếu nghi vấn enum UserRole ở DB thiếu value, kiểm tra migration/enum trong DB.
            }
        }

        // 6) Menu Item Ingredients
        const ingredientCount = await this.ingredientRepo.count();
        if (ingredientCount === 0) {
            const menuItems = await this.menuItemRepo.find({ relations: ['category'] });
            const inventoryItems = await this.inventoryItemRepo.find();

            const tom = inventoryItems.find((i) => i.name.includes('Tôm'));
            const bia = inventoryItems.find((i) => i.name.includes('Bia'));
            const tomHapBia = menuItems.find((i) => i.name.includes('Tôm hấp bia'));

            if (tom && bia && tomHapBia) {
                const ingredients = this.ingredientRepo.create([
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
                await this.ingredientRepo.save(ingredients);
                this.logger.log('✅ Seeded Menu Item Ingredients');
            } else {
                this.logger.warn('⚠️ Không đủ dữ liệu để seed nguyên liệu món ăn');
            }
        }

        // 7) Inventory Transactions (Opening stock via ledger)
        const transactionCount = await this.inventoryTransactionRepo.count();
        if (transactionCount === 0) {
            const user = await this.userRepo.findOne({ where: { email: 'admin@restaurant.com' } });
            const tTomSu = await this.inventoryItemRepo.findOne({ where: { name: 'Tôm sú' } });
            const tHeineken = await this.inventoryItemRepo.findOne({ where: { name: 'Bia Heineken' } });

            if (!tTomSu || !tHeineken || !user) {
                this.logger.warn('⚠️ Không đủ dữ liệu để seed Inventory Transactions');
            } else {
                const openingList: Array<{ item: InventoryItem; qty: number; note: string }> = [
                    { item: tTomSu, qty: 50, note: 'Nhập kho đầu kỳ' },
                    { item: tHeineken, qty: 100, note: 'Nhập kho đầu kỳ' },
                ];

                for (const row of openingList) {
                    const before = Number(row.item.quantity ?? 0);
                    const delta = Number(row.qty);
                    const after = before + delta;

                    row.item.quantity = after;
                    await this.inventoryItemRepo.save(row.item);

                    const tx = this.inventoryTransactionRepo.create({
                        item: row.item,
                        quantity: delta,
                        action: InventoryAction.IMPORT,
                        note: row.note,
                        beforeQty: before,
                        afterQty: after,
                        refType: 'OPENING',
                        refId: row.item.id,
                        performedBy: user,
                    });
                    await this.inventoryTransactionRepo.save(tx);
                }

                this.logger.log('✅ Seeded Inventory Transactions (opening balances)');
            }
        }

        this.logger.log('🎉 Seeder hoàn tất.');
    }
}
