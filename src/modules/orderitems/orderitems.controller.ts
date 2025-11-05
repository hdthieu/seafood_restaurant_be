import { Controller, Get, Patch, Query, Body } from '@nestjs/common';
import { OrderItemsService } from './orderitems.service';
import { ItemStatus } from 'src/common/enums';
import { UpdateItemsStatusDto } from './dto/update-items-status.dto';
import { CancelItemsDto, CancelPartialDto } from './dto/cancel-items.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/user.decorator';
@Controller('orderitems')



export class OrderItemsController {
  constructor(private readonly svc: OrderItemsService) {}

  @Get()
  async listByStatus(
    @Query('status') status: ItemStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '200',
  ) {
    return this.svc.listByStatus({ status, page: Number(page), limit: Number(limit) });
  }

  @Patch('status')
  async updateStatus(@Body() dto: UpdateItemsStatusDto) {
    return this.svc.updateStatusBulk(dto);
  }


  @UseGuards(JwtAuthGuard)
   @Patch('cancel')
  cancelBulk(@Body() dto: CancelItemsDto,
   @CurrentUser() user: any

) {
    return this.svc.cancelItems(dto, user.id);
  }
  @UseGuards(JwtAuthGuard)
  @Patch('cancel-partial')
  cancelPartial(@Body() dto: CancelPartialDto,
   @CurrentUser() user: any,
) {
    return this.svc.cancelPartial(dto, user.id);
  }
  @Patch('move-one')
async moveOne(@Body() dto: { itemId: string; to: ItemStatus }) {
  return this.svc.moveOne(dto.itemId, dto.to);
}

}
