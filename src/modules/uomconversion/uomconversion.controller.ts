import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { UomconversionService } from './uomconversion.service';
import { ListUomConversionQueryDto } from './dto/list-uomconversion.query.dto';

@ApiTags('UomConversion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uomconversion')
export class UomconversionController {
    constructor(private readonly svc: UomconversionService) { }

    @Post()
    @ApiOperation({ summary: 'Tạo quy đổi UOM: 1 from = factor * to' })
    create(@Body() dto: CreateUomconversionDto) {
        return this.svc.create(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Danh sách các quy đổi UOM (có phân trang)' })
    list(@Query() q: ListUomConversionQueryDto) {
        return this.svc.list(q);
    }
}
