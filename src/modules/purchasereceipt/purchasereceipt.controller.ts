import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
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
}