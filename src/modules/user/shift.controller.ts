// src/modules/shift/shift.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { ShiftService } from './services/shift.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@ApiTags('Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftController {
  constructor(private readonly service: ShiftService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo ca làm việc' })
  create(@Body() dto: CreateShiftDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Danh sách ca' })
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết ca' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật ca' })
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xoá ca' })
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
