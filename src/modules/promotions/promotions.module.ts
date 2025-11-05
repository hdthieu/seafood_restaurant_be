import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { InvoicePromotion } from './entities/invoicepromotion.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { Category } from '@modules/category/entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion, InvoicePromotion, MenuItem, Category])],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService]
})
export class PromotionsModule { }
