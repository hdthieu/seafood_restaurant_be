import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SuppliergroupService } from './suppliergroup.service';
import { CreateSupplierGroupDto } from './dto/create-suppliergroup.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';

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
}
