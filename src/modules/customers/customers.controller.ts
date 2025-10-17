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
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { CustomerInvoiceListResp } from './dtos/query-customer-history.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { Patch } from '@nestjs/common';
import {UpdateCustomerDto} from './dtos/update-customer.dto';

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
  @Get('customers/search')
  search(
    @Query('q') q = '',
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.svc.search(q, limit ?? 10);
  }
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
 @Get('customers/:id')
  async getOne(@Param('id') id: string) {
    const data = await this.svc.getDetail(id);
    return { code: 200, success: true, message: 'OK', data };
  }

  @Patch('customers/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const data = await this.svc.update(id, dto);
    return { code: 200, success: true, message: 'Cập nhật thành công', data };
  }
  // GET /customers/search: autocomplete nhanh (giữ nguyên)


   @Get('customers/:id/invoices')
  async customerInvoices(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ResponseCommon<CustomerInvoiceListResp, PageMeta>> {
    const p = Number(page || 1);
    const l = Number(limit || 20);
    return this.svc.getInvoicesByCustomer(id, p, l);
  }


  @Get('customers/walkin')
  getWalkin() {
    return this.svc.getOrCreateWalkin();
  }
}
