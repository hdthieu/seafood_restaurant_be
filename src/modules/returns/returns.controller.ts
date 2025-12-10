import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SalesReturnService } from "./services/sales-return.service";
import { CreateSalesReturnDto } from "./dto/create-sales-return.dto";
import { JwtAuthGuard } from "@modules/core/auth/guards/jwt-auth.guard";
import { CurrentUser } from "src/common/decorators/user.decorator";
import { UnauthorizedException } from "@nestjs/common";
@Controller("returns")
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly svc: SalesReturnService) {}

  @Get()
  async list(
    @Query("search") search: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.svc.list({
      search,
      from,
      to,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get("invoices")
  listReturnableInvoices(
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    return this.svc.listReturnableInvoices({
      search,
      from,
      to,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get("invoice/:invoiceId")
  getInvoiceSummary(@Param("invoiceId") invoiceId: string) {
    return this.svc.getInvoiceReturnSummary(invoiceId);
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const data = await this.svc.getDetail(id);
    return { data };
  }

@Post()
create(
  @Body() dto: CreateSalesReturnDto,
  @CurrentUser() user: any,
) {
  //   payload thật sự có field id
  const cashierId: string | undefined = user?.id;

  if (!cashierId) {
    // cho chắc, nếu sau này đổi payload thì sẽ biết ngay
    throw new UnauthorizedException('CURRENT_USER_MISSING_ID');
  }

  return this.svc.create(dto, cashierId);
}

}