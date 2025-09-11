import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';

import { UpdateOrderDto } from './dto/update-order.dto';
import { SetQtyDto } from './dto/set-item-qty.dto';
import {
  BadRequestException, ParseUUIDPipe,
  Query, UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './order.service';
import { CreateOrderDto as CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-dtos';
import { UpdateOrderStatusDto } from './dto/update-order-status';
import { AddItemsDto } from '../orderitems/dto/create-orderitem.dto';
import { UpdateOrderItemQtyDto } from './dto/update-order-item';
import { CancelOrderDto } from './dto/cancel-order.dto';
// import { AuthGuard } from 'src/common/guards/auth.guard';
import { IsInt, Min } from 'class-validator';
@ApiTags('orders')
@ApiBearerAuth()
// @UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo đơn (PENDING)' })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách đơn (phân trang, lọc theo status)' })
  list(@Query() q: ListOrdersDto & { excludeStatus?: string }) {
  const page = Math.max(1, Number(q.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
  return this.ordersService.list({ page, limit, status: q.status, excludeStatus: q.excludeStatus });
}

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đơn' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.detail(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn (theo transition map)' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto /* , userId */);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Thêm món vào đơn (chỉ khi PENDING/CONFIRMED)' })
  addItems(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddItemsDto,
  ) {
    return this.ordersService.addItems(id, dto);
  }

  @Patch(':id/items/:itemId/remove')
  @ApiOperation({ summary: 'Bớt món/loại món khỏi đơn (chỉ khi PENDING/CONFIRMED)' })
  removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.ordersService.removeItem(id, itemId);
  }



@Patch(':id/items/:itemId/qty')
  @ApiOperation({ summary: 'Cập nhật số lượng 1 dòng món (PENDING/CONFIRMED). quantity=0 thì xóa' })
  updateItemQty(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: SetQtyDto,                               // <-- dùng bình thường
  ) {
    return this.ordersService.setItemQty(id, itemId, dto.quantity);
  }


  @Patch(':id/cancel')
@ApiOperation({ summary: 'Hủy đơn hàng (hoàn kho nếu cần, huỷ/void invoice nếu chưa thanh toán)' })
cancel(
  @Param('id', new ParseUUIDPipe()) id: string,
  @Body() dto: CancelOrderDto,
) {
  return this.ordersService.cancel(id, dto);
}
}


