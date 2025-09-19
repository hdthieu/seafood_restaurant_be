// report.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ReportService } from './report.service';
import type { RangeKey } from 'src/common/date-range';

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
export class ReportController {
  constructor(private readonly svc: ReportService) {}

  @Get('dashboard/summary')
  @ApiQuery({ name: 'range', required: false, enum: RangeKeyEnum, example: 'today' })
  summary(@Query('range') range: RangeKey = 'today') {
    return this.svc.summary(range);
  }

  @Get('dashboard/top-items')
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
  @ApiQuery({ name: 'range', required: false, enum: RangeKeyEnum, example: 'today' })
  @ApiQuery({ name: 'granularity', required: false, enum: GranularityEnum, example: 'day' })
  sales(
    @Query('range') range: RangeKey = 'today',
    @Query('granularity') granularity: 'day' | 'hour' | 'dow' = 'day',
  ) {
    return this.svc.salesSeries(range, granularity);
  }
}
