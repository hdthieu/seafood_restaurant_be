// src/modules/customers/customers.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customers.entity';
import { CustomersFilterDto } from './dtos/customers-filter.dto';
import { CreateCustomerDto } from './dtos/create-customers.dto';

class UpsertByPhoneBody {
  phone: string;
  name?: string;
  email?: string;
  gender?: string;         // vẫn để lỏng ở đây nếu bạn muốn
  birthday?: string | null;
  address?: string;
}

class AttachCustomerBody {
  customerId?: string;
  walkin?: boolean;
}

@Controller()
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  // GET /customers: filter + paging (đang đúng)
  @Get('customers')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  find(@Query() dto: CustomersFilterDto) {
    return this.svc.filterAndPaginate(dto);
  }

  // POST /customers: tạo mới theo DTO chuẩn (PERSONAL/COMPANY + gender enum)
  @Post('customers')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  // GET /customers/search: autocomplete nhanh (giữ nguyên)
  @Get('customers/search')
  search(
    @Query('q') q = '',
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.svc.search(q, limit ?? 10);
  }

  // POST /customers/upsert-by-phone (giữ nguyên kiểu cũ nếu bạn vẫn dùng)
  // @Post('customers/upsert-by-phone')
  // upsertByPhone(@Body() body: UpsertByPhoneBody) {
  //   const { phone, name, birthday, ...rest } = body;

  //   const partial: Partial<Omit<Customer, 'id' | 'code' | 'isWalkin'>> = {
  //     ...rest,
  //     ...(birthday !== undefined
  //       ? { birthday: birthday ? new Date(birthday) : null }
  //       : {}),
  //   };

  //   return this.svc.upsertByPhone(phone, name, partial);
  // }

  @Get('customers/walkin')
  getWalkin() {
    return this.svc.getOrCreateWalkin();
  }

  // Gắn khách vào order
  @Post('orders/:orderId/attach-customer')
  attachToOrder(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() body: AttachCustomerBody,
  ) {
    if (!body.walkin && !body.customerId) {
      throw new BadRequestException('customerId or walkin is required');
    }
    return this.svc.attachToOrder({
      orderId,
      customerId: body.customerId,
      walkin: !!body.walkin,
    });
  }

  // Tạo mới và gắn vào order trong 1 call (dùng DTO chuẩn)
  @Post('orders/:orderId/customers')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createAndAttach(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    const c = await this.svc.create(dto);
    return this.svc.attachToOrder({ orderId, customerId: c.id });
  }
}
