import { Module } from '@nestjs/common';
import { PurchasereceiptitemService } from './purchasereceiptitem.service';
import { PurchasereceiptitemController } from './purchasereceiptitem.controller';

@Module({
  controllers: [PurchasereceiptitemController],
  providers: [PurchasereceiptitemService],
})
export class PurchasereceiptitemModule {}
