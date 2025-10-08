import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { InvoicePromotion } from './entities/invoicepromotion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion, InvoicePromotion])],
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule { }
