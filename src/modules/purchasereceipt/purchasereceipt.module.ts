import { Module } from '@nestjs/common';
import { PurchasereceiptService } from './purchasereceipt.service';
import { PurchasereceiptController } from './purchasereceipt.controller';

@Module({
  controllers: [PurchasereceiptController],
  providers: [PurchasereceiptService],
})
export class PurchasereceiptModule {}
