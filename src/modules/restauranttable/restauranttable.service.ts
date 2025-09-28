import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RestaurantTable } from './entities/restauranttable.entity';
import { Repository } from 'typeorm';
import { Area } from '../area/entities/area.entity';
import { CreateRestaurantTableDto } from './dto/create-restauranttable.dto';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { TableStatus } from 'src/common/enums';
import { UpdateTableDto } from './dto/update-table.dto';
import { QueryTableDto } from './dto/query-table.dto';
@Injectable()
export class RestaurantTablesService {
    constructor(
        @InjectRepository(RestaurantTable)
        private readonly tableRepo: Repository<RestaurantTable>,
        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    async create(createDto: CreateRestaurantTableDto): Promise<RestaurantTable> {
        // 1. Kiểm tra tên bàn đã tồn tại chưa
        const existed = await this.tableRepo.findOne({
            where: {
                name: createDto.name,
                area: { id: createDto.areaId },
            },
        });

        if (existed) {
            throw new ResponseException('Bàn đã tồn tại', 400);
        }

        // 2. Kiểm tra areaId có tồn tại không
        const area = await this.areaRepo.findOne({ where: { id: createDto.areaId } });
        if (!area) {
            throw new ResponseException('Khu vực không tồn tại', 400);
        }

        // 3. Tạo mới bàn
        const newTable = this.tableRepo.create({
            name: createDto.name,
            seats: createDto.seats ?? 4,
            note: createDto.note,
            status: createDto.status ?? TableStatus.ACTIVE,
            area,
        });

        return this.tableRepo.save(newTable);
    }

    // function for get all tables
    async findAll({ page = 1, limit = 12, area }: QueryTableDto) {
        const [data, total] = await this.tableRepo.findAndCount({
            where: area ? { area: { name: area } } : {},
            order: { name: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    // function for get table by id
    async getInfoTable(id: string): Promise<RestaurantTable> {
        const table = await this.tableRepo.findOne({
            where: { id },
        });

        if (!table) {
            throw new ResponseException('Bàn không tồn tại', 404);
        }

        return table;
    }

    // function for update table by id
    async updateTable(id: string, dto: UpdateTableDto): Promise<RestaurantTable> {
        const table = await this.getInfoTable(id);
        Object.assign(table, dto);
        return this.tableRepo.save(table);
    }

    // function for delete table by id
    async deleteTable(id: string): Promise<{ message: string }> {
        const table = await this.getInfoTable(id);
        await this.tableRepo.remove(table);
        return { message: 'Xóa bàn thành công' };
    }

}
