import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller('area')
@ApiBearerAuth()
export class AreaController {
  constructor(private readonly areaService: AreaService) { }

  // this endpoint for create new area
  @Post('create-area')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo khu vực' })
  create(@Body() dto: CreateAreaDto) {
    return this.areaService.createArea(dto);
  }

  // this endpoint for get area
  @Get('get-list-area')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách khu vực (có bàn)' })
  getInfoArea(@Body() dto: any) {
    return this.areaService.getInfoArea(dto);
  }

  // this endpoint for get area by name
  @Post('get-id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy ID khu vực theo tên' })
  async getAreaIdByName(@Body() body: { name: string }) {
    return this.areaService.getAreaIdByName(body.name);
  }




}
