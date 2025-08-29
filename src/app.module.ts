import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { InventorytransactionModule } from './modules/inventorytransaction/inventorytransaction.module';
import { InventoryitemsModule } from './modules/inventoryitems/inventoryitems.module';
import { OrderitemsModule } from './modules/orderitems/orderitems.module';
import { OrderModule } from './modules/order/order.module';
import { MenuitemsModule } from './modules/menuitems/menuitems.module';
import { MenucategoryModule } from './modules/menucategory/menucategory.module';
import { ProfileModule } from './modules/profile/profile.module';
import { UserModule } from './modules/user/user.module';
import { MenuitemingredientModule } from './modules/menuitemingredient/menuitemingredient.module';
import { OrderstatushistoryModule } from './modules/orderstatushistory/orderstatushistory.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SeederModule } from './modules/seeder/seeder.module';
import { RestauranttableModule } from './modules/restauranttable/restauranttable.module';
import { AuthModule } from './modules/core/auth/auth.module';
import { AreaModule } from './modules/area/area.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }),
  TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST as string,
    port: parseInt(process.env.DB_PORT as string, 10),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    synchronize: true,
    autoLoadEntities: true
  }),
    UserModule, ProfileModule, MenucategoryModule, MenuitemsModule, OrderModule, OrderitemsModule, InventoryitemsModule, InventorytransactionModule, InvoiceModule, MenuitemingredientModule, OrderstatushistoryModule, SeederModule, RestauranttableModule, AuthModule, AreaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
