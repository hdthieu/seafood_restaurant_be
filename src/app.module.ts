import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './src/modules/user/user.module';
import { UserModule } from './user/user.module';
import { UserModule } from './modules/user/user.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { InventorytransactionModule } from './modules/inventorytransaction/inventorytransaction.module';
import { InventoryitemsModule } from './modules/inventoryitems/inventoryitems.module';
import { OrderitemsModule } from './modules/orderitems/orderitems.module';
import { OrderModule } from './modules/order/order.module';
import { MenuitemsModule } from './modules/menuitems/menuitems.module';
import { MenucategoryModule } from './modules/menucategory/menucategory.module';
import { MenucategoryModule } from './modules/menucategory/menucategory.module';
import { TableModule } from './modules/table/table.module';
import { TableModule } from './modules/table/table.module';
import { ProfileModule } from './modules/profile/profile.module';
import { UserModule } from './modules/user/user.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [UserModule, ProfileModule, TableModule, MenucategoryModule, MenuitemsModule, OrderModule, OrderitemsModule, InventoryitemsModule, InventorytransactionModule, InvoiceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
