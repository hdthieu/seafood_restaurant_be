// src/modules/waiter-notification/waiter-notifications.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WaiterNotification } from './waiter-notification.entity';
import { WaiterNotificationsService } from './waiter-notifications.service';
import { WaiterNotificationsController } from './waiter-notifications.controller';

import { User } from 'src/modules/user/entities/user.entity';
// (nếu cần dùng UserModule chỗ khác, có thể import luôn)
import { UserModule } from 'src/modules/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaiterNotification,
      User,             
    ]),
    forwardRef(() => UserModule),
  ],
  controllers: [WaiterNotificationsController],
  providers: [WaiterNotificationsService],
  exports: [WaiterNotificationsService],
})
export class WaiterNotificationsModule {}
