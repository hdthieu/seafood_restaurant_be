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
import { ReportModule } from '@modules/report/report.module';
import { UnitsOfMeasureModule } from './modules/units-of-measure/units-of-measure.module';
import { UomconversionModule } from './modules/uomconversion/uomconversion.module';
import { MenucomboitemModule } from './modules/menucomboitem/menucomboitem.module';
import * as Joi from 'joi';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { FaceModule } from './modules/face/face.module';
import { CashbookModule } from './modules/cashbook/cashbook.module';
import { SocketModule } from "@modules/socket/socket.module";
import { KitchenModule } from "./modules/kitchen/kitchen.module";
import { PurchasereturnModule } from './modules/purchasereturn/purchasereturn.module';
import { AiModule } from "@modules/ai/ai.module";
import { RagModule } from "@modules/rag/rag.module";
import { LlmGateway } from "@modules/ai/llm.gateway";
import { PayrollModule } from "@modules/payroll/payroll.module";
@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,


    envFilePath: ['.env'], // tùy path
    validationSchema: Joi.object({
      NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      APP_PORT: Joi.number().default(8000),

      // --- PayOS ---
      PAYOS_CLIENT_ID: Joi.string().required(),
      PAYOS_API_KEY: Joi.string().required(),
      PAYOS_CHECKSUM_KEY: Joi.string().required(),
      PAYOS_RETURN_URL: Joi.string().uri().required(),
      PAYOS_CANCEL_URL: Joi.string().uri().required(),

      // --- VietQR (img.vietqr.io) ---
      VIETQR_BANK_BIN: Joi.string().required(),
      VIETQR_ACCOUNT_NO: Joi.string().required(),
      VIETQR_ACCOUNT_NAME: Joi.string().optional(),

      // --- Webhook HMAC cho “casso/payos-like” (nếu dùng) ---
      WEBHOOK_SECRET: Joi.string().optional(),

      // --- VNPay (nếu vẫn dùng) ---
      VNP_TMN_CODE: Joi.string().optional(),
      VNP_HASH_SECRET: Joi.string().optional(),
      VNP_URL: Joi.string().uri().optional(),
      VNP_RETURN_URL: Joi.string().uri().optional(),
      VNP_LOCALE: Joi.string().optional(),
      VNP_VERSION: Joi.string().optional(),

      // --- JWT ---
      JWT_ACCESS_SECRET: Joi.string().required(),
      JWT_REFRESH_SECRET: Joi.string().required(),
      JWT_ACCESS_EXPIRES: Joi.string().default('120m'),
      JWT_REFRESH_EXPIRES: Joi.string().default('30d'),
      REKOG_COLLECTION_ID: Joi.string().required(),



      FRONTEND_URL: Joi.string().uri().optional(),
      TZ: Joi.string().optional(),
    }),
  }),

  TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST as string,
    port: parseInt(process.env.DB_PORT as string, 10),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    // entities: [__dirname + '/**/*.entity{.ts,.js}'],
    synchronize: true,
     ssl: { rejectUnauthorized: false }, 
    autoLoadEntities: true,
    // logging: ['error', 'warn', 'query'],
  }),
    UserModule, ProfileModule, MenuitemsModule, OrdersModule, OrderitemsModule, InventoryitemsModule, InventorytransactionModule, InvoiceModule, OrderstatushistoryModule, RestauranttableModule, AuthModule, AreaModule, ConfigS3Module, IngredientModule, CategoryModule, PaymentModule, CustomersModule, SupplierModule, PurchasereceiptModule, PurchasereceiptitemModule, SuppliergroupModule, ReportModule, UnitsOfMeasureModule, UomconversionModule, MenucomboitemModule, PromotionsModule, FaceModule, CashbookModule, SocketModule, KitchenModule, PurchasereturnModule, AiModule, RagModule, PayrollModule],
  controllers: [AppController],
  providers: [AppService, LlmGateway],
})
export class AppModule { }
