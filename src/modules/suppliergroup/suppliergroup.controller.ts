import { Controller, Post, Body, UseGuards, Get, Query, Patch, Param, Delete } from '@nestjs/common';
import { SuppliergroupService } from './suppliergroup.service';
import { CreateSupplierGroupDto } from './dto/create-suppliergroup.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { QuerySupplierGroupDto } from './dto/query-supplier-group.dto';
import { UpdateSuppliergroupDto } from './dto/update-suppliergroup.dto';
import { DeleteSupplierGroupDto } from './dto/delete-supplier-group.dto';

@Controller('suppliergroup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliergroupController {
  constructor(private readonly suppliergroupService: SuppliergroupService) { }

  @Post('/create-supplier-group')
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreateSupplierGroupDto) {
    return this.suppliergroupService.create(dto);
  }

  @Get('/get-all-supplier-groups')
  @Roles(UserRole.CASHIER, UserRole.MANAGER, UserRole.WAITER, UserRole.KITCHEN)
  findAll(@Query() q: QuerySupplierGroupDto) {
    return this.suppliergroupService.findAll(q);
  }

  @Patch('/update-suppliergroup/:id')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Update Supplier Group' })
  update(@Param('id') id: string, @Body() dto: UpdateSuppliergroupDto) {
    return this.suppliergroupService.update(id, dto);
  }

  // Deactivate (không xoá cứng)
  @Patch('/:id/deactivate')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Deactivate Supplier Group (ngưng hoạt động)' })
  deactivate(@Param('id') id: string) {
    return this.suppliergroupService.deactivate(id);
  }

  // Delete với tuỳ chọn chuyển nhóm
  // @Delete('/:id')
  // @Roles(UserRole.MANAGER)
  // @ApiOperation({
  //   summary:
  //     'Delete Supplier Group. Nếu nhóm còn supplier, cần reassignToId để chuyển supplier trước khi xoá',
  // })
  // remove(@Param('id') id: string, @Body() body: DeleteSupplierGroupDto) {
  //   return this.suppliergroupService.remove(id, body?.reassignToId);
  // }
}
