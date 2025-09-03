import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { RestaurantTablesService } from './restauranttable.service';
import { CreateRestaurantTableDto } from './dto/create-restauranttable.dto';
import { RestaurantTable } from './entities/restauranttable.entity';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { RolesGuard } from '../core/auth/guards/roles.guard';

@Controller('restauranttable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestauranttableController {
  constructor(private readonly restauranttableService: RestaurantTablesService) { }

  // this endpoint for get all tables
  @Post('/create-table')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Thêm mới bàn [Only MANAGER]' })
  async create(@Body() dto: CreateRestaurantTableDto): Promise<RestaurantTable> {
    return this.restauranttableService.create(dto);
  }

  // this endpoint for get all tables
  @Get('/get-all-tables')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách tất cả bàn' })
  async findAll(): Promise<RestaurantTable[]> {
    return this.restauranttableService.findAll();
  }

}
