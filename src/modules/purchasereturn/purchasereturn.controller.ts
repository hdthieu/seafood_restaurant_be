import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Delete } from '@nestjs/common';
import { PurchasereturnService } from './purchasereturn.service';
import { UpdateStandaloneReturnDto } from './dto/update-standalone-return.dto';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UserRole } from 'src/common/enums';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { ParseUUIDPipe } from '@nestjs/common';
import { StandaloneReturnDto } from './dto/standalone-return.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { QueryPurchaseReturnDto } from './dto/query-purchase-return.dto';

@ApiTags('Purchase Returns')
@Controller('purchasereturn')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasereturnController {
  constructor(private readonly purchasereturnService: PurchasereturnService) { }

  // BY_RECEIPT flow is disabled - system only supports STANDALONE returns

  @Post('/create-standalone')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create Standalone Purchase Return (reduce stock, manual refund)' })
  async createStandalone(
    @CurrentUser('id') userId: string,
    @Body() dto: StandaloneReturnDto,
  ) {
    return await this.purchasereturnService.createStandalone(userId, dto);
  }

  @Post('/create-draft')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create Draft Purchase Return (no inventory change)' })
  async createDraft(
    @CurrentUser('id') userId: string,
    @Body() dto: StandaloneReturnDto,
  ) {
    return await this.purchasereturnService.createDraft(userId, dto);
  }

  // hàm này 
  @Post(':id/mark-refunded')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Mark a purchase return as refunded' })
  async markRefunded(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return await this.purchasereturnService.markRefunded(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Change status of a purchase return' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return await this.purchasereturnService.changeStatus(id, dto.status);
  }

  @Get('get/:id')
  @Roles(UserRole.MANAGER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Get purchase return by id' })
  async getOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return await this.purchasereturnService.getOne(id);
  }

  @Get('/get-all-purchasereturns')
  @Roles(UserRole.MANAGER)
  findAll(@Query() q: QueryPurchaseReturnDto) {
    return this.purchasereturnService.findAll(q);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a purchase return (draft: full update; posted: only refund amount)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateStandaloneReturnDto,
  ) {
    return await this.purchasereturnService.update(id, userId, dto as any);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete a purchase return (only allowed for DRAFT)' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return await this.purchasereturnService.remove(id);
  }

}
