// src/modules/returns/returns.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ReturnsController } from "./returns.controller";
import { SalesReturnService } from "./services/sales-return.service";

import { SalesReturn } from "./entities/sales-return.entity";
import { SalesReturnItem } from "./entities/sale-return-item.enity";

import { Invoice } from "../invoice/entities/invoice.entity";
import { OrderItem } from "../orderitems/entities/orderitem.entity";
import { User } from "../user/entities/user.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesReturn,
      SalesReturnItem,
      Invoice,
      OrderItem,
      User,
    ]),
  ],
  controllers: [ReturnsController],
  providers: [SalesReturnService],
  exports: [SalesReturnService],
})
export class ReturnsModule {}



