import { Controller, Get, Post, Body, UseGuards, Query, Patch, Delete, Put } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UomconversionService } from './uomconversion.service';
import { ListUomConversionQueryDto } from './dto/list-uomconversion.query.dto';
import { DeleteUomConversionDto } from './dto/delete-uomconversion.dto';
import { UserRole } from 'src/common/enums';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';

@ApiTags('UomConversion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uomconversion')
export class UomconversionController {
    constructor(private readonly svc: UomconversionService) { }

    @Post()
    @Roles(UserRole.MANAGER)
    @ApiOperation({ summary: 'Tạo quy đổi UOM: 1 from = factor * to' })
    create(@Body() dto: CreateUomconversionDto) {
        return this.svc.create(dto);
    }

    @Get()
    @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
    @ApiOperation({ summary: 'Danh sách các quy đổi UOM (có phân trang)' })
    list(@Query() q: ListUomConversionQueryDto) {
        return this.svc.list(q);
    }

    @Put()
    @Roles(UserRole.MANAGER)
    @ApiOperation({ summary: 'Cập nhật hệ số quy đổi UOM' })
    update(@Body() dto: UpdateUomconversionDto) {
        return this.svc.update(dto);
    }

    @Delete()
    @Roles(UserRole.MANAGER)
    @ApiOperation({ summary: 'Xóa một quy đổi UOM' })
    remove(@Body() dto: DeleteUomConversionDto) {
        return this.svc.remove(dto);
    }
}
