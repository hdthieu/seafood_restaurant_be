import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportController } from './report.controller';
import { ReportService } from './report.service';

import { Order } from 'src/modules/order/entities/order.entity';
import { OrderItem } from 'src/modules/orderitems/entities/orderitem.entity';
import { Invoice } from 'src/modules/invoice/entities/invoice.entity';
import { MenuItem } from 'src/modules/menuitems/entities/menuitem.entity'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Invoice,
      MenuItem, // 👈 THÊM VÀO ĐÂY
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
