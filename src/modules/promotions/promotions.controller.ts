import { Controller, Post, Body, UseGuards, Query, Get, Param, Patch, HttpStatus, Delete, HttpCode } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ListPromotionsDto } from './dto/list-promotions.dto';

@Controller('promotions')
@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly service: PromotionsService) { }

  @Post('create')
  @ApiOperation({ summary: 'Create new promotion' })
  @Roles(UserRole.MANAGER)
  async create(@Body() dto: CreatePromotionDto) {
    return await this.service.createPromotion(dto);
  }

  @Get('list-all')
  @ApiOperation({ summary: 'Get all promotions with filters & pagination' })
  async findAll(@Query() query: ListPromotionsDto) {
    // debug tạm
    console.log('query raw:', query, typeof query.isActive, query.isActive);
    return this.service.findAllPromotions(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get promotion details by ID' })
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  findById(@Param('id') id: string) {
    return this.service.findPromotionById(id);
  }

  @Patch(':id/update')
  @ApiOperation({ summary: 'Update promotion by ID' })
  @Roles(UserRole.MANAGER)
  updatePromotion(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.service.updatePromotion(id, dto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate or deactivate promotion by ID' })
  @Roles(UserRole.MANAGER)
  activatePromotion(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.service.activatePromotion(id, isActive);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a promotion (mark as deleted)' })
  @Roles(UserRole.MANAGER)
  softDelete(@Param('id') id: string) {
    return this.service.softDeletePromotion(id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted promotion' })
  @Roles(UserRole.MANAGER)
  restore(@Param('id') id: string) {
    return this.service.restorePromotion(id);
  }
}
