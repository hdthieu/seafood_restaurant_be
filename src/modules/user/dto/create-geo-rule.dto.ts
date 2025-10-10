// src/modules/attendance/dto/create-geo-rule.dto.ts
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { Transform } from 'class-transformer';


/**
 * Hỗ trợ cả 2 kiểu tên field:
 * - lat/lng/radius (chuẩn mới)
 * - centerLat/centerLng/radiusMeters (alias cho FE cũ)
 */
// src/modules/user/dto/create-geo-rule.dto.ts


export class CreateGeoRuleDto {
  @IsString() name: string;

  @IsNumber() @Min(-90)  @Max(90)  lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;

  @IsNumber() @Min(1) radius: number;

  @IsOptional() @IsBoolean() isActive?: boolean;
}






export class CreateNetRuleDto {
  branchId?: string;
  label?: string;          // <-- label (không phải name)
  ssid?: string;
  bssid?: string;          // aa:bb:cc:dd:ee:ff
  cidr?: string;           // 192.168.1.0/24 (hoặc IPv6)
  isActive?: boolean;
}

