// src/modules/shift/shift.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from '../entities/shift.entity';
import { CreateShiftDto } from '../dto/create-shift.dto';
import { UpdateShiftDto } from '../dto/update-shift.dto';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class ShiftService {
  constructor(@InjectRepository(Shift) private repo: Repository<Shift>) { }

  async create(dto: CreateShiftDto) {
    if (toMinutes(dto.endTime) <= toMinutes(dto.startTime)) {
      throw new ResponseException(null, 400, 'END_TIME_MUST_BE_AFTER_START_TIME');
    }
    const created = this.repo.create(dto);
    return this.repo.save(created);
  }

  async findAll() {
    const [data, total] = await this.repo.findAndCount({ order: { startTime: 'ASC' } });
    return { data, total };
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new ResponseException(null, 404, 'SHIFT_NOT_FOUND');
    return item;
  }

  async update(id: string, dto: UpdateShiftDto) {
    const item = await this.findOne(id);
    const merged = this.repo.merge(item, dto);
    if (merged.startTime && merged.endTime) {
      if (toMinutes(merged.endTime) <= toMinutes(merged.startTime)) {
        throw new ResponseException(null, 400, 'END_TIME_MUST_BE_AFTER_START_TIME');
      }
    }
    return this.repo.save(merged);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { success: true };
  }
}
