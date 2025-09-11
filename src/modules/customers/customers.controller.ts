// src/modules/customers/customers.controller.ts
import { Body, Controller, Get, ParseIntPipe, ParseUUIDPipe, Post, Query, BadRequestException, Param } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customers.entity';
class CreateCustomerBody {
  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthday?: string;
  address?: string;
  code?: string;
}
class UpsertByPhoneBody {
  phone: string;
  name?: string;
  email?: string;
  gender?: string;
  birthday?: string | null; // <-- string vào
  address?: string;
}
class AttachCustomerBody {
  customerId?: string;
  walkin?: boolean;
}

@Controller()
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Post('customers')
  create(@Body() dto: CreateCustomerBody) {
    return this.svc.create(dto);
  }

  @Get('customers/search')
  search(
    @Query('q') q = '',
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.svc.search(q, limit ?? 10);
  }

  @Post('customers/upsert-by-phone')
upsertByPhone(@Body() body: UpsertByPhoneBody) {
  const { phone, name, birthday, ...rest } = body;

  // build partial đúng kiểu service cần (birthday: Date | null | undefined)
  const partial: Partial<Omit<Customer, 'id' | 'code' | 'isWalkin'>> = {
    ...rest,
    ...(birthday !== undefined
      ? { birthday: birthday ? new Date(birthday) : null }
      : {}),
  };

  return this.svc.upsertByPhone(phone, name, partial);
}
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

  // (tuỳ chọn) tạo mới và gắn vào order trong 1 call
  @Post('orders/:orderId/customers')
  async createAndAttach(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: CreateCustomerBody,
  ) {
    const c = await this.svc.create(dto);
    return this.svc.attachToOrder({ orderId, customerId: c.id });
  }
}
