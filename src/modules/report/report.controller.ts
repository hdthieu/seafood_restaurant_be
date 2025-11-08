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
  /* ====== 3) BÁO CÁO LỢI NHUẬN THEO NHÂN VIÊN ====== */
  // @Get('profit-by-staff')
  // profitByStaff(@Query() q: StaffReportQueryDto) {
  //   return this.svc.staffProfit(q);
  // }
}
