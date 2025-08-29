import { Module } from '@nestjs/common';
import { OrderstatushistoryService } from './orderstatushistory.service';
import { OrderstatushistoryController } from './orderstatushistory.controller';

@Module({
  controllers: [OrderstatushistoryController],
  providers: [OrderstatushistoryService],
})
export class OrderstatushistoryModule {}
