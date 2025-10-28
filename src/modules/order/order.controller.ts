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
import { Not, In } from 'typeorm';
import { OrderStatus } from 'src/common/enums';

import { Order } from './entities/order.entity';
import {NotFoundException} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidationPipe } from '@nestjs/common';
import { OpenOrdersByTableQueryDto, OpenInTableQueryDto } from './dto/open-orders-by-table.dto';
import { OpenTablesQueryDto } from './dto/open-tables.query';
import { SplitOrderDto } from './dto/split-order.dto';
import {RestaurantTable} from '../restauranttable/entities/restauranttable.entity';
class MergeOrderDto {
  toOrderId!: string; // id đơn đích
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService,
  @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  @InjectRepository(RestaurantTable) private readonly tableRepo: Repository<RestaurantTable>,

  ) {}

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
  // Danh sách đơn đang mở (không PAID/CANCELLED) của một bàn cụ thể




@Get('tables/without-open-orders')
async tablesWithoutOpen(
  @Query('excludeTableId') excludeTableId?: string,
) {
  return this.tableRepo.createQueryBuilder('t')
    .leftJoin(Order, 'o',
      'o.tableId = t.id AND o.status NOT IN (:...ended)',
      { ended: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.MERGED] }
    )
    .where('o.id IS NULL')                      // không có đơn mở
    .andWhere(excludeTableId ? 't.id <> :ex' : '1=1', { ex: excludeTableId })
    .orderBy('t.name','ASC')
    .getMany(); // trả [{id,name,...}]
}


 @Get('open-by-table')
  async openOrdersByTable(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: OpenOrdersByTableQueryDto,
  ) {
    const { excludeOrderId, excludeTableId } = query;

    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoin('o.table', 't')
      .select('t.id', 'tableId')
      .addSelect('t.name', 'tableName')
      .addSelect('COUNT(o.id)', 'orderCount')
      .addSelect('COALESCE(SUM(o.total), 0)', 'totalAmount') // nếu có cột total
      .where('o.status NOT IN (:...ended)', { ended: [OrderStatus.PAID, OrderStatus.CANCELLED] });

    if (excludeOrderId) qb.andWhere('o.id <> :excludeOrderId', { excludeOrderId });
    if (excludeTableId) qb.andWhere('t.id <> :excludeTableId', { excludeTableId });

    const rows = await qb
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('t.name', 'ASC')
      .getRawMany<{ tableId: string; tableName: string; orderCount: string; totalAmount: string }>();

    return rows.map(r => ({
      tableId: r.tableId,
      tableName: r.tableName,
      orderCount: Number(r.orderCount ?? 0),
      totalAmount: Number(r.totalAmount ?? 0),
    }));
  }
@Get('open-tables')
async listTablesHasOpenOrders(
  @Query(new ValidationPipe({ transform: true, whitelist: true }))
  query: OpenTablesQueryDto,
) {
  const { excludeOrderId, excludeTableId } = query;

  const qb = this.orderRepo.createQueryBuilder('o')
    .leftJoin('o.table', 't')
    .select('t.id', 'tableId')
    .addSelect('t.name', 'tableName')
    .where('o.status NOT IN (:...ended)', { ended: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.MERGED] });

  if (excludeOrderId)
    qb.andWhere('o.id <> :excludeOrderId', { excludeOrderId });
  if (excludeTableId)
    qb.andWhere('t.id <> :excludeTableId', { excludeTableId });

  const rows = await qb
    .groupBy('t.id')
    .addGroupBy('t.name')
    .orderBy('t.name', 'ASC')
    .getRawMany<{ tableId: string; tableName: string }>();

  return rows;
}

  // === B) Danh sách ĐƠN mở trong 1 bàn ===
  // FE hook: useOpenOrdersInTable(tableId) -> GET /orders/open-in-table?tableId=...
  // Trả về: [{ id, tableName, customerName, itemsCount, total }]
  @Get('open-in-table')
  async openInTable(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: OpenInTableQueryDto,
  ) {
    const { tableId, excludeOrderId } = query;

    // Không có tableId thì trả mảng rỗng (FE đã enable theo UUID)
    if (!tableId) return [];

    const rows = await this.orderRepo.find({
      where: {
        table: { id: tableId } as any,
        id: excludeOrderId ? Not(excludeOrderId) : undefined,
        status: Not(In([OrderStatus.PAID, OrderStatus.CANCELLED,OrderStatus.MERGED])),
      },
      relations: ['table', 'items'], // nếu muốn đếm items ngay
      order: { createdAt: 'ASC' },
    });

    return rows.map(o => ({
      id: o.id,
      tableName: o.table?.name ?? '',
      // customerName: o.customerName ?? null, // nếu có cột
      itemsCount: Array.isArray(o.items) ? o.items.length : 0,
      total: Number((o as any).total ?? 0), // nếu có cột total
      createdAt: o.createdAt,
    }));
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
@Post(':id/split')
async split(
  @Param('id') id: string,
  @Body() dto: SplitOrderDto,
) {
  return this.ordersService.splitOrder(id, dto);
}

@Post(':fromId/merge-into')
  async mergeInto(
    @Param('fromId') fromId: string,
    @Body() body: MergeOrderDto,
  ) {
    if (!body?.toOrderId) throw new NotFoundException('Thiếu toOrderId');
    return this.ordersService.mergeOrders(fromId, body.toOrderId);
  }


}

