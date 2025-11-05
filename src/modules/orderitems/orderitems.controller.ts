import { Controller, Get, Patch, Query, Body } from '@nestjs/common';
import { OrderItemsService } from './orderitems.service';
import { ItemStatus } from 'src/common/enums';
import { UpdateItemsStatusDto } from './dto/update-items-status.dto';
import { CancelItemsDto, CancelPartialDto } from './dto/cancel-items.dto';
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
   @Patch('cancel')
  cancelBulk(@Body() dto: CancelItemsDto) {
    return this.svc.cancelItems(dto);
  }

  @Patch('cancel-partial')
  cancelPartial(@Body() dto: CancelPartialDto) {
    return this.svc.cancelPartial(dto);
  }
  @Patch('move-one')
async moveOne(@Body() dto: { itemId: string; to: ItemStatus }) {
  return this.svc.moveOne(dto.itemId, dto.to);
}

}
