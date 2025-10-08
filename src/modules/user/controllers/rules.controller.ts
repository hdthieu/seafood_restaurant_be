import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RulesService } from '../services/rules.service';
import { CreateGeoRuleDto } from '../dto/create-geo-rule.dto';
import { UpdateGeoRuleDto } from '../dto/update-geo-rule.dto';

@ApiTags('admin/attendance/rules')
@Controller('admin/attendance/rules')
export class RulesController {
  constructor(private readonly svc: RulesService) {}

  // GEO
  @Get('geo') listGeo() { return this.svc.listGeo(); }
  @Post('geo') createGeo(@Body() dto: CreateGeoRuleDto) { return this.svc.createGeo(dto); }
  @Patch('geo/:id') updateGeo(@Param('id') id: string, @Body() dto: UpdateGeoRuleDto) { return this.svc.updateGeo(id, dto); }
  @Delete('geo/:id') delGeo(@Param('id') id: string) { return this.svc.deleteGeo(id); }

  // NET
  @Get('net') listNet() { return this.svc.listNet(); }
  @Post('net') createNet(@Body() dto: any) { return this.svc.createNet(dto); }
  @Patch('net/:id') updateNet(@Param('id') id: string, @Body() dto: any) { return this.svc.updateNet(id, dto); }
  @Delete('net/:id') delNet(@Param('id') id: string) { return this.svc.deleteNet(id); }
}
