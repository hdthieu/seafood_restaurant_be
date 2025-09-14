import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseUUIDPipe, Query } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { SupplierStatus, UserRole } from 'src/common/enums';
import { QuerySupplierDto } from './dto/query-supplier.dto';

@Controller('supplier')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) { }

  // CREATE
  @Post('/create-supplier')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create New Supplier' })
  create(@Body() dto: CreateSupplierDto) {
    return this.supplierService.create(dto);
  }

  // LIST (paging + filter + q)
  @Get('/get-list-suppliers')
  @Roles(UserRole.CASHIER, UserRole.MANAGER, UserRole.WAITER)
  @ApiOperation({ summary: 'List suppliers (search/filter/paging)' })
  findAll(@Query() qry: QuerySupplierDto) {
    return this.supplierService.findAll(qry);
  }

  // DETAIL
  @Get('/get/:id')
  @Roles(UserRole.CASHIER, UserRole.MANAGER, UserRole.WAITER)
  @ApiOperation({ summary: 'Get supplier by id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.supplierService.findOne(id);
  }

  // UPDATE
  @Patch('/update-supplier/:id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Update supplier' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(id, dto);
  }

  // SOFT DELETE (set INACTIVE)
  @Delete('/delete-supplier/:id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Deactivate supplier (soft delete)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.supplierService.remove(id);
  }

  // (Optional) CHANGE STATUS
  @Patch(':id/status/:status')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Change supplier status' })
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('status') status: SupplierStatus,
  ) {
    return this.supplierService.setStatus(id, status);
  }

}
