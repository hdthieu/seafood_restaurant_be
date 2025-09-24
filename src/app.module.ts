import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { InventorytransactionModule } from './modules/inventorytransaction/inventorytransaction.module';
import { InventoryitemsModule } from './modules/inventoryitems/inventoryitems.module';
import { OrderitemsModule } from './modules/orderitems/orderitems.module';
import { OrdersModule } from './modules/order/order.module';
import { MenuitemsModule } from './modules/menuitems/menuitems.module';
import { ProfileModule } from './modules/profile/profile.module';
import { UserModule } from './modules/user/user.module';
import { OrderstatushistoryModule } from './modules/orderstatushistory/orderstatushistory.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { RestauranttableModule } from './modules/restauranttable/restauranttable.module';
import { AuthModule } from './modules/core/auth/auth.module';
import { AreaModule } from './modules/area/area.module';
import { ConfigS3Module } from './common/AWS/config-s3/config-s3.module';
import { IngredientModule } from './modules/ingredient/ingredient.module';
import { CategoryModule } from './modules/category/category.module';
import { PaymentModule } from './modules/payments/payments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { PurchasereceiptModule } from './modules/purchasereceipt/purchasereceipt.module';
import { PurchasereceiptitemModule } from './modules/purchasereceiptitem/purchasereceiptitem.module';
import { SuppliergroupModule } from './modules/suppliergroup/suppliergroup.module';
import {ReportModule} from './report/report.module';
import { ReportController } from './report/report.controller';
import { ReportService } from './report/report.service';
import { CashbookModule } from './cashbook/cashbook.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }),
  TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST as string,
    port: parseInt(process.env.DB_PORT as string, 10),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    // entities: [__dirname + '/**/*.entity{.ts,.js}'],
    synchronize: true,
    autoLoadEntities: true
  }),
    UserModule, ProfileModule, MenuitemsModule, OrdersModule, OrderitemsModule, InventoryitemsModule, InventorytransactionModule, InvoiceModule, OrderstatushistoryModule, RestauranttableModule, AuthModule, AreaModule, ConfigS3Module, IngredientModule, CategoryModule, PaymentModule, CustomersModule, SupplierModule, PurchasereceiptModule, PurchasereceiptitemModule, SuppliergroupModule, ReportModule, CashbookModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
