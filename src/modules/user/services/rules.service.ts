// src/modules/user/services/rules.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeoRule } from '../entities/geo-rules.entity';
import { NetRule } from '../entities/net-rules.entity';

type CreateGeoRuleDto = {
  name?: string;           // nếu bạn lưu tên hiển thị, có thể bỏ qua trong entity
  lat: number;             // cho phép FE gửi tên ngắn
  lng: number;
  radius: number;
  isActive?: boolean;
};

type UpdateGeoRuleDto = Partial<CreateGeoRuleDto>;

type CreateNetRuleDto = {
  label?: string | null;
  ssid?: string | null;
  bssid?: string | null;
  cidr?: string | null;
  isActive?: boolean;
};

type UpdateNetRuleDto = Partial<CreateNetRuleDto>;

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(GeoRule) private readonly geoRepo: Repository<GeoRule>,
    @InjectRepository(NetRule) private readonly netRepo: Repository<NetRule>,
  ) {}

  // ---------- GEO ----------
  listGeo() {
    return this.geoRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createGeo(dto: CreateGeoRuleDto) {
    // Chuẩn hoá field từ FE: lat/lng/radius -> centerLat/centerLng/radiusMeter
    const entity = this.geoRepo.create({
      centerLat: dto.lat,
      centerLng: dto.lng,
      radiusMeter: dto.radius,
      isActive: dto.isActive ?? true,
      // các mặc định an toàn
      requireGps: true,
      requireWifiWhenOnWifi: true,
      wifiCidrs: [],
      wifiSsids: [],
    });
    return this.geoRepo.save(entity);
  }

  async updateGeo(id: string, dto: UpdateGeoRuleDto) {
    const patch: Partial<GeoRule> = {};
    if (dto.lat !== undefined) patch.centerLat = dto.lat;
    if (dto.lng !== undefined) patch.centerLng = dto.lng;
    if (dto.radius !== undefined) patch.radiusMeter = dto.radius;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    await this.geoRepo.update(id, patch);
    return this.geoRepo.findOne({ where: { id } });
  }

  async deleteGeo(id: string) {
    await this.geoRepo.delete(id);
    return { id, ok: true };
  }

  // ---------- NET ----------
  listNet() {
    return this.netRepo.find({ order: { createdAt: 'DESC' } });
  }

  createNet(dto: CreateNetRuleDto) {
    const norm = (v?: string | null) => (v ?? '').trim() || null;
    const entity = this.netRepo.create({
      label: norm(dto.label),
      isActive: dto.isActive ?? true,
      ssid: norm(dto.ssid),
      bssid: norm(dto.bssid)?.toLowerCase(),
      cidr: norm(dto.cidr),
    });
    return this.netRepo.save(entity);
  }

  async updateNet(id: string, dto: UpdateNetRuleDto) {
    const norm = (v?: string | null) => (v ?? '').trim() || null;
    await this.netRepo.update(id, {
      label: norm(dto.label),
      isActive: dto.isActive,
      ssid: norm(dto.ssid),
      bssid: norm(dto.bssid)?.toLowerCase(),
      cidr: norm(dto.cidr),
    });
    return this.netRepo.findOne({ where: { id } });
  }

  async deleteNet(id: string) {
    await this.netRepo.delete(id);
    return { id, ok: true };
  }

  /** Lấy toàn bộ rule đang bật để verify (GPS + Wi-Fi/IP) */
  async getRules() {
    const [geo, net] = await Promise.all([
      this.geoRepo.find({ where: { isActive: true } }),
      this.netRepo.find({ where: { isActive: true } }),
    ]);
    return { geo, net };
  }
}
