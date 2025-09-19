import { Controller, Post, Body, UseGuards, Req, Get, Param, Query } from '@nestjs/common';
import { PurchasereceiptService } from './purchasereceipt.service';
import { CreatePurchaseReceiptDto } from './dto/create-purchasereceipt.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UserRole } from 'src/common/enums';
import { CurrentUser } from 'src/common/decorators/user.decorator';

@ApiTags('Purchase Receipts')
@Controller('purchasereceipt')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasereceiptController {
  constructor(private readonly purchasereceiptService: PurchasereceiptService) { }

  // this endpoint will create a purchase receipt along with its items (DRAFT status)
  @Post('create-purchase-receipt')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create Draft Purchase Receipt' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    console.log('userId controller ', userId);
    return this.purchasereceiptService.createDraft(userId, dto);
  }

  // this endpoint will get purchase receipt detail by its ID
  @Get('/getId/:id')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get Purchase Receipt detail by ID' })
  getDetail(@Param('id') id: string) {
    return this.purchasereceiptService.getDetail(id);
  }

  // this endpoint will get purchase receipt detail by its CODE
  @Get('list')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get paginated list of Purchase Receipts' })
  async getList(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.purchasereceiptService.getList(Number(page), Number(limit));
  }

}