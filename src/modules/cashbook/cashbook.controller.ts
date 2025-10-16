import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CashbookService } from './cashbook.service';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { CreateCashbookEntryDto } from './dto/create-cashbook.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { UpdateCashOtherPartyDto } from './dto/update-cash-other-party.dto';
import { ListCashOtherPartyDto } from './dto/list-cash-other-party.dto';
import { CreateCashOtherPartyDto } from './dto/create-cash-other-party.dto';
import { ListCashbookEntryDto } from './dto/list-cashbook.dto';

@ApiTags('CashBook')
@Controller('cashbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashbookController {
  constructor(private readonly cashbookService: CashbookService
  ) { }

  @Post('create-cashbook')
  @ApiOperation({ summary: 'Create a new cashbook entry' })
  @Roles(UserRole.MANAGER)
  async create(@Body() dto: CreateCashbookEntryDto) {
    return await this.cashbookService.createCashBookEntry(dto);
  }

  @Get('list-cashbook')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'List cashbook entries (paged) + summary' })
  async list(@Query() q: ListCashbookEntryDto) {
    return await this.cashbookService.listCashBookEntries(q);
  }
  @Get('detail-cashbook:id')
  @ApiOperation({ summary: 'Get details of a Cashbook entry' })
  async findOne(@Param('id') id: string) {
    return this.cashbookService.findOneCashbook(id);
  }
  // @Get('entries/summary')
  // @Roles(UserRole.MANAGER)
  // @ApiOperation({ summary: 'Summary opening/receipt/payment/closing' })
  // async summary(@Query() q: ListCashbookEntryDto) {
  //   return this.cashbookService.summaryCashBookEntries(q);
  // }


  // controller dùng cho cash other party
  // ------------------ CASH OTHER PARTY ------------------

  @Post('create-other-party')
  @ApiOperation({ summary: 'Create a new cash other party' })
  async createCashOtherParty(@Body() dto: CreateCashOtherPartyDto) {
    return await this.cashbookService.createCashOtherParty(dto);
  }

  @Get('list-other-party')
  @ApiOperation({ summary: 'List all cash other parties' })
  async listCashOtherParties(@Query() q: ListCashOtherPartyDto) {
    return await this.cashbookService.listCashOtherParty(q);
  }

  @Get('get-other-party/:id')
  @ApiOperation({ summary: 'Get details of a cash other party by ID' })
  async findOneCashOtherParty(@Param('id') id: string) {
    return await this.cashbookService.findOneCashOtherParty(id);
  }

  @Patch('update-other-party/:id')
  @ApiOperation({ summary: 'Update a cash other party by ID' })
  async updateCashOtherParty(@Param('id') id: string, @Body() dto: UpdateCashOtherPartyDto) {
    return await this.cashbookService.updateCashOtherParty(id, dto);
  }

  @Delete('remove-other-party/:id')
  @ApiOperation({ summary: 'Delete a cash other party by ID' })
  async removeCashOtherParty(@Param('id') id: string) {
    await this.cashbookService.removeCashOtherParty(id);
  }

}
