import { Controller, Post, Body, UseGuards, Req, Get, Param, Query, Patch, Put, ParseUUIDPipe } from '@nestjs/common';
import { PurchasereceiptService } from './purchasereceipt.service';
import { CreatePurchaseReceiptDto } from './dto/create-purchasereceipt.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UserRole } from 'src/common/enums';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { PayReceiptDto } from './dto/pay-receipt.dto';
import { UpdatePurchaseReceiptDto } from './dto/update-purchasereceipt.dto';
import { ReturnReceiptDto } from '../purchasereturn/dto/return-receipt.dto';
import { StandaloneReturnDto } from '../purchasereturn/dto/standalone-return.dto';

@ApiTags('Purchase Receipts')
@Controller('purchasereceipt')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasereceiptController {
  constructor(private readonly purchasereceiptService: PurchasereceiptService) { }

  // this endpoint will create a purchase receipt along with its items (DRAFT status)
  @Post('create-purreceipt-draft')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create Draft Purchase Receipt' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    console.log('userId controller ', userId);
    return await this.purchasereceiptService.createDraft(userId, dto);
  }

  // this endpoint will get purchase receipt detail by its ID
  @Get('/getId/:id')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get Purchase Receipt detail by ID' })
  async getDetail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return await this.purchasereceiptService.getDetail(id);
  }

  // this endpoint will get purchase receipt detail by its CODE
  @Get('list')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get paginated list of Purchase Receipts' })
  async getList(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return await this.purchasereceiptService.getList(Number(page), Number(limit));
  }

  // this endpoint will post (finalize) a DRAFT receipt -> POSTED and update stock/avgCost
  @Post('create-purreceipt-posted')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Post (finalize) a DRAFT receipt -> POSTED & update stock/avgCost' })
  async postReceipt(@CurrentUser('id') userId: string,
    @Body() dto: CreatePurchaseReceiptDto,) {
    console.log('userId controller ', userId);
    return await this.purchasereceiptService.createAndPost(userId, dto);
  }

  // this endpoint will cancel a receopt (only DRAFT can be cancelled)
  @Post(':id/cancel')
  @Roles(UserRole.MANAGER)
  async cancelReceipt(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return await this.purchasereceiptService.cancelReceipt(id);
  }

  // this endpoint 
  @Post(':id/pay')
  @Roles(UserRole.MANAGER)
  async payReceipt(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: PayReceiptDto) {
    return await this.purchasereceiptService.payReceipt(id, dto);
  }


  @Put('/update-draft-or-post/:id')
  async updateDraftOrPost(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) receiptId: string,
    @Body() dto: UpdatePurchaseReceiptDto,
    @Query('postNow') postNow: string,
  ) {
    const isPostNow = postNow === 'true';

    return await this.purchasereceiptService.updateDraftOrPost(userId, receiptId, dto, isPostNow);
  }

  
}