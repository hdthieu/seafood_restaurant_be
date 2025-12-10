import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { WaiterNotificationsService } from './waiter-notifications.service';
import { JwtAuthGuard } from 'src/modules/core/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { Body } from '@nestjs/common';

@Controller('waiter-notifications')
@UseGuards(JwtAuthGuard)
export class WaiterNotificationsController {
  constructor(private readonly svc: WaiterNotificationsService) {}

  @Get('me')
  async myNotifications(@CurrentUser() user: any) {
    return this.svc.findMyNotifications(user.id);
  }

  @Get('me/unread-count')
  async myUnreadCount(@CurrentUser() user: any) {
    return this.svc.unreadCount(user.id);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markAsRead(id, user.id);
  }
  @Patch('read-many')
async markManyRead(
  @Body('ids') ids: string[],
  @CurrentUser() user: any,
) {
  return this.svc.markManyAsRead(ids ?? [], user.id);
}
}

