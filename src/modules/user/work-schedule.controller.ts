// src/modules/user/work-schedule.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkScheduleService } from './work-schedule.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';

@ApiTags('Work Schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedules')
export class WorkScheduleController {
  constructor(private readonly service: WorkScheduleService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo lịch làm việc (1 nhân viên / nhiều nhân viên, có thể lặp tuần)' })
  create(@Body() dto: CreateScheduleDto) { return this.service.create(dto); }

  @Get('week')
  @Roles(UserRole.MANAGER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Danh sách lịch theo tuần' })
  listWeek(
    @Query('start') start: string, // YYYY-MM-DD (thứ 2)
    @Query('end') end: string,     // YYYY-MM-DD (chủ nhật)
    @Query('userIds') userIds?: string, // "id1,id2"
  ) {
    const ids = userIds ? userIds.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    return this.service.listByWeek(start, end, ids);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật lịch của 1 nhân viên' })
  update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xoá 1 lịch' })
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Delete('repeat/:groupId')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xoá cả chuỗi lặp' })
  removeRepeat(@Param('groupId') groupId: string) {
    return this.service.removeRepeatGroup(groupId);
  }
}
