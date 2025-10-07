import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';

@Controller('promotions')
@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly service: PromotionsService) { }

  @Post('create')
  @ApiOperation({ summary: 'Create promotion' })
  @ApiBody({ type: CreatePromotionDto })
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreatePromotionDto) {
    return this.service.create(dto);
  }
}
