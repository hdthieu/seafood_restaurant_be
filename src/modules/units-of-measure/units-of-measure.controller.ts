import { Controller, Get, Post, Body, Query, Param, Patch, Delete } from '@nestjs/common';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { CreateUnitsOfMeasureDto } from './dto/create-units-of-measure.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { UserRole } from 'src/common/enums';
import { Roles } from 'src/common/decorators/roles.decorator';
import { ListUnitsOfMeasureQueryDto } from './dto/list-units-of-measure.query.dto';
import { UpdateUnitsOfMeasureDto } from './dto/update-units-of-measure.dto';

@ApiTags('UnitsOfMeasure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('units-of-measure')
export class UnitsOfMeasureController {
  constructor(private readonly unitsOfMeasureService: UnitsOfMeasureService) { }

  @Post()
  @ApiOperation({ summary: 'Tạo đơn vị đo lường mới' })
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreateUnitsOfMeasureDto) {
    return this.unitsOfMeasureService.create(dto);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Danh sách tất cả đơn vị đo lường (có phân trang)' })
  list(@Query() q: ListUnitsOfMeasureQueryDto) {
    return this.unitsOfMeasureService.list(q);
  }

  @Get(':code')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Chi tiết một đơn vị đo lường' })
  getOne(@Param('code') code: string) {
    return this.unitsOfMeasureService.getOne(code);
  }

  @Patch(':code')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật UOM (đổi tên, đổi dimension khi chưa được sử dụng)' })
  update(@Param('code') code: string, @Body() dto: UpdateUnitsOfMeasureDto) {
    return this.unitsOfMeasureService.update(code, dto);
  }

  @Delete(':code')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa UOM (khi chưa được sử dụng)' })
  remove(@Param('code') code: string) {
    return this.unitsOfMeasureService.remove(code);
  }
}
