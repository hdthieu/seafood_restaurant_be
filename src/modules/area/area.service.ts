import { Injectable } from '@nestjs/common';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Area } from './entities/area.entity';
import { Repository } from 'typeorm';
import { AreaStatus } from 'src/common/enums';

@Injectable()
export class AreaService {

    constructor(
        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    async createArea(dto: CreateAreaDto): Promise<Area> {
        const area = this.areaRepo.create({
            ...dto,
            status: dto.status || AreaStatus.AVAILABLE,
        });
        return this.areaRepo.save(area);
    }


}
