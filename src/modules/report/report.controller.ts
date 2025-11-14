// report.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiQuery, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReportService } from './report.service';
import type { RangeKey } from 'src/common/date-range';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { SalesDailyQueryDto } from './dto/sales-daily.query.dto';
import { StaffReportQueryDto } from './dto/staff-report.query.dto';
import { BaseRangeDto } from './dto/base-range.dto';
import { CashbookDailyQueryDto } from './dto/cashbook-daily.query.dto';
import { CustomerSalesQueryDto } from './dto/customer-sales.query.dto';
import { SupplierReportQueryDto } from '@modules/report/dto/supplier-report.query.dto';
import { ProfitByInvoiceQueryDto, ProfitDailyQueryDto } from './dto/profit.query.dto';
import { InvoiceDiscountQueryDto } from './dto/invoice-discount.query.dto';

enum RangeKeyEnum {
  today = 'today',
  yesterday = 'yesterday',
  last7 = 'last7',
  thisMonth = 'thisMonth',
  lastMonth = 'lastMonth',
}
enum GranularityEnum {
  day = 'day',
  hour = 'hour',
  dow = 'dow',
}
enum TopByEnum {
  qty = 'qty',
  revenue = 'revenue',
}

@ApiTags('Report')
@Controller('report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly svc: ReportService) { }

  @Get('dashboard/summary')
  @Roles(UserRole.MANAGER)
  @ApiQuery({ name: 'range', required: false, enum: RangeKeyEnum, example: 'today' })
  summary(@Query('range') range: RangeKey = 'today') {
    return this.svc.summary(range);
  }

  @Get('dashboard/top-items')
  @Roles(UserRole.MANAGER)
  @ApiQuery({ name: 'range', required: false, enum: RangeKeyEnum, example: 'last7' })
  @ApiQuery({ name: 'by', required: false, enum: TopByEnum, example: 'qty' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  topItems(
    @Query('range') range: RangeKey = 'last7',
    @Query('by') by: 'qty' | 'revenue' = 'qty',
    @Query('limit') limit = 10,
  ) {
    return this.svc.topItems(range, by, Number(limit));
  }

  @Get('dashboard/sales')
  @Roles(UserRole.MANAGER)
  @ApiQuery({ name: 'range', required: false, enum: RangeKeyEnum, example: 'today' })
  @ApiQuery({ name: 'granularity', required: false, enum: GranularityEnum, example: 'day' })
  sales(
    @Query('range') range: RangeKey = 'today',
    @Query('granularity') granularity: 'day' | 'hour' | 'dow' = 'day',
  ) {
    return this.svc.salesSeries(range, granularity);
  }

  // ================= BÁO CÁO CUỐI NGÀY ==================
  // ================= 1) BÁN HÀNG CUỐI NGÀY ==================
  @Get("daily-sales")
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Get daily sales report (END OF THE DAY)' })
  dailySales(@Query() q: SalesDailyQueryDto) { // Đổi tên hàm thành dailySales
    return this.svc.salesDaily(q);
  }
  // ================= 2) SỔ QUỸ CUỐI NGÀY ==================
  @Get('daily-cashbook')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Get daily cashbook report (END OF THE DAY)' })
  dailyCashbook(@Query() q: CashbookDailyQueryDto) {
    return this.svc.cashbookDaily(q);
  }
  // ================= 3) HÀNG HỦY CUỐI NGÀY ==================
  @Get('daily-cancel-items')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Get daily canceled items report (END OF THE DAY)' })
  dailyCancelItems(@Query() q: BaseRangeDto) {
    return this.svc.cancelItemsDaily(q);
  }

  // ================= BÁO CÁO KHÁCH HÀNG ==================
  // 1) Bán hàng (theo hóa đơn)
  @Get('customer-sales')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo bán hàng theo khách (hóa đơn)' })
  customerSales(@Query() q: CustomerSalesQueryDto) {
    return this.svc.customerSales(q);
  }

  // 2) Hàng bán theo khách (gom theo món)
  // @Get('customer-sales/items')
  // @Roles(UserRole.MANAGER)
  // @ApiOperation({ summary: 'Báo cáo hàng bán theo khách (theo món)' })
  // customerSalesItems(@Query() q: CustomerSalesQueryDto) {
  //   return this.svc.customerSalesItems(q);
  // }

  // ================= BÁO CÁO NHÀ CUNG CẤP ==================
  // 1) Top nhà cung cấp (đã trừ trả hàng)
  @Get('suppliers/top')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Top nhà cung cấp theo giá trị nhập (Phiếu Nhập Ròng)' })
  suppliersTop(@Query() q: SupplierReportQueryDto) {
    return this.svc.suppliersTop(q);
  }

  // 2) Nhập hàng theo nhà cung cấp (gộp NCC và chi tiết phiếu)
  @Get('purchases/by-supplier')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo nhập hàng theo nhà cung cấp (Phiếu Nhập)' })
  purchasesBySupplier(@Query() q: SupplierReportQueryDto) {
    return this.svc.purchasesBySupplier(q);
  }

  // 3) Hàng nhập theo NCC (theo mặt hàng)
  @Get('purchases/by-supplier/items')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo mặt hàng nhập theo nhà cung cấp (Phiếu Nhập)' })
  purchasesBySupplierItems(@Query() q: SupplierReportQueryDto) {
    return this.svc.purchasesBySupplierItems(q);
  }

  // 4) Trả hàng theo nhà cung cấp (chi tiết phiếu trả)
  @Get('purchase-returns/by-supplier')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo trả hàng theo nhà cung cấp (chi tiết phiếu trả)' })
  purchaseReturnsBySupplier(@Query() q: SupplierReportQueryDto) {
    return this.svc.purchaseReturnsBySupplier(q);
  }

  // 5) Mặt hàng trả theo nhà cung cấp (theo mặt hàng)
  @Get('purchase-returns/by-supplier/items')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo mặt hàng trả hàng theo nhà cung cấp (Phiếu trả)' })
  purchaseReturnItemsBySupplier(@Query() q: SupplierReportQueryDto) {
    return this.svc.purchaseReturnItemsBySupplier(q);
  }

  // ================= BÁO CÁO BÁN HÀNG THEO NHÂN VIÊN ==================
  /* ====== 1) BÁN HÀNG ====== */
  @Get('sales-by-staff')
  @Roles(UserRole.MANAGER)
  salesByStaff(@Query() q: StaffReportQueryDto) {
    return this.svc.staffSales(q);
  }
  /* ====== 2) BÁO CÁO HÀNG BÁN THEO NHÂN VIÊN ====== */
  @Get('sales-by-staff/items')
  salesByStaffItems(@Query() q: StaffReportQueryDto) {
    return this.svc.staffSalesItems(q);
  }


  /* ====== 2) BÁO CÁO HÀNG BÁN HÀNG (MỐI QUAN TÂM: LỢI NHUẬN) ====== */
  // LỢI NHUẬN
  @Get('profit/daily')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Biểu đồ lợi nhuận theo ngày' })
  profitDaily(@Query() q: ProfitDailyQueryDto) {
    return this.svc.profitDaily(q);
  }

  @Get('profit/by-invoice')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Bảng lợi nhuận theo hóa đơn' })
  profitByInvoice(@Query() q: ProfitByInvoiceQueryDto) {
    return this.svc.profitByInvoice(q);
  }

  // GIẢM GIÁ HÓA ĐƠN
  @Get('invoice-discounts')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Báo cáo tổng hợp giảm giá hóa đơn' })
  invoiceDiscounts(@Query() q: InvoiceDiscountQueryDto) {
    return this.svc.invoiceDiscounts(q);
  }

  /* ====== 3) BÁO CÁO LỢI NHUẬN THEO NHÂN VIÊN ====== */
  // @Get('profit-by-staff')
  // profitByStaff(@Query() q: StaffReportQueryDto) {
  //   return this.svc.staffProfit(q);
  // }
}
