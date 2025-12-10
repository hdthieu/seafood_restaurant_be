import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaiterNotification } from './waiter-notification.entity';
import { WaiterNotificationsService } from './waiter-notifications.service';
import { WaiterNotificationsController } from './waiter-notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WaiterNotification])],
  providers: [WaiterNotificationsService],
  controllers: [WaiterNotificationsController],
  exports: [WaiterNotificationsService],
})
export class WaiterNotificationsModule {}
