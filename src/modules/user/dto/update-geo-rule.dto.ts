import { PartialType } from '@nestjs/mapped-types'; // hoặc '@nestjs/swagger'
import { CreateNetRuleDto } from './create-geo-rule.dto';
import { CreateGeoRuleDto } from './create-geo-rule.dto';
/**
 * Update = các field đều optional dựa trên Create DTO
 */
export class UpdateNetRuleDto extends PartialType(CreateNetRuleDto) {}
export class UpdateGeoRuleDto extends PartialType(CreateGeoRuleDto) {}