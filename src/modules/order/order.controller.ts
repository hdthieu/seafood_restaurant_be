import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';

import { OrdersService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-dtos';
import { UpdateOrderStatusDto } from './dto/update-order-status';
import { AddItemsDto } from '../orderitems/dto/create-orderitem.dto'; // <-- DTO có batchId?
import { SetQtyDto } from './dto/set-item-qty.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo đơn (PENDING) + tạo items PENDING + trừ kho' })
  create(@Body() dto: CreateOrderDto,
    @CurrentUser() user:any 
  ) {
    return this.ordersService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách đơn (phân trang, lọc theo status, excludeStatus)' })
  list(@Query() q: ListOrdersDto & { excludeStatus?: string }) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    return this.ordersService.list({
      page,
      limit,
      status: q.status,
      excludeStatus: q.excludeStatus,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đơn' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.detail(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Cập nhật trạng thái đơn theo transition map. ' +
      'CONFIRMED hoạt động như “re-confirm” (ghi history, không đổi order.status hiện hành).',
  })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post(':id/items')
  @ApiOperation({
    summary:
      'Thêm món vào đơn (mỗi lần báo tạo dòng mới, gán batchId). ' +
      'Cho phép khi đơn chưa PAID/CANCELLED.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        batchId: { type: 'string', nullable: true, description: 'ID của 1 lần báo bếp (tuỳ chọn)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['menuItemId', 'quantity'],
            properties: {
              menuItemId: { type: 'string', format: 'uuid' },
              quantity: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      required: ['items'],
      example: {
        batchId: 'd2f5d4f4-7c3c-4b3d-9d4f-0f4eea1d4b77',
        items: [{ menuItemId: 'd0b1c7f6-2fba-4c6f-94c8-9f9e6a9a8f01', quantity: 2 }],
      },
    },
  })
  addItems(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddItemsDto, // <-- nhận batchId? từ FE
  ) {
    return this.ordersService.addItems(id, dto);
  }

  @Patch(':id/items/:itemId/remove')
  @ApiOperation({
    summary:
      'Xoá 1 dòng món khỏi đơn (hoàn kho delta). Cho phép khi đơn chưa PAID/CANCELLED.',
  })
  removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.ordersService.removeItem(id, itemId);
  }

  @Patch(':id/items/:itemId/qty')
  @ApiOperation({
    summary:
      'Cập nhật số lượng 1 dòng món (delta kho tự động). quantity<=0 thì xoá dòng. ' +
      'Cho phép khi đơn chưa PAID/CANCELLED.',
  })
  updateItemQty(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: SetQtyDto,
  ) {
    return this.ordersService.setItemQty(id, itemId, dto.quantity);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Huỷ đơn: nếu chưa thanh toán thì hoàn kho toàn bộ, huỷ/void invoice; set đơn -> CANCELLED.',
  })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(id, dto);
  }
}
