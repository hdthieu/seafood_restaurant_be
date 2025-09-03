import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { CreateMenuItemDto } from './dto/create-menuitem.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';


@Controller('menuitems')
@ApiBearerAuth()
export class MenuitemsController {
  constructor(private readonly menuitemsService: MenuitemsService) { }

  @Post('/create-menuitem')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách nhân viên [MANAGER]' })
  async create(@Body() dto: CreateMenuItemDto) {
    return this.menuitemsService.createMenuItem(dto);
  }
}
