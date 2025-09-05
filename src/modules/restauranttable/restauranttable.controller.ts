import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Put } from '@nestjs/common';
import { RestaurantTablesService } from './restauranttable.service';
import { CreateRestaurantTableDto } from './dto/create-restauranttable.dto';
import { RestaurantTable } from './entities/restauranttable.entity';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { UpdateTableDto } from './dto/update-table.dto';

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
  @ApiOperation({ summary: 'Lấy danh sách tất cả bàn [Tất cả các Roles]' })
  async findAll(): Promise<RestaurantTable[]> {
    return this.restauranttableService.findAll();
  }

  // this endpoint for get table by id
  @Get('/get-table/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin bàn theo ID [Tất cả các Roles]' })
  async getInfoTable(@Param('id') id: string): Promise<RestaurantTable> {
    return this.restauranttableService.getInfoTable(id);
  }

  // this endpoint for delete table by id
  @Put('/:id')
  @ApiOperation({ summary: 'Cập nhật thông tin bàn [Only MANAGER]' })
  @Roles(UserRole.MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateTableDto): Promise<RestaurantTable> {
    return this.restauranttableService.updateTable(id, dto);
  }

  // this endpoint for delete table by id
  @Delete('/:id')
  @ApiOperation({ summary: 'Xoá bàn [Only MANAGER]' })
  @Roles(UserRole.MANAGER)
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    return this.restauranttableService.deleteTable(id);
  }
}
