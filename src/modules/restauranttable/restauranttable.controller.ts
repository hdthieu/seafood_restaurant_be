import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { RestaurantTablesService } from './restauranttable.service';
import { CreateRestaurantTableDto } from './dto/create-restauranttable.dto';
import { RestaurantTable } from './entities/restauranttable.entity';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller('restauranttable')
@ApiBearerAuth()
export class RestauranttableController {
  constructor(private readonly restauranttableService: RestaurantTablesService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Thêm mới bàn [Only Admin]' })
  async create(@Body() dto: CreateRestaurantTableDto): Promise<RestaurantTable> {
    return this.restauranttableService.create(dto);
  }
}
