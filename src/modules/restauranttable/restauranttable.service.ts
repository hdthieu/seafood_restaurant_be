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
import { PageMeta } from 'src/common/common_dto/paginated';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { DataSource } from 'typeorm';
import { Invoice } from '../invoice/entities/invoice.entity';
import { TableTransactionsQueryDto } from './dto/table-transactions.dto';
import { TableTransactionsResp } from './dto/table-transactions.resp';
@Injectable()
export class RestaurantTablesService {
  constructor(
    @InjectRepository(RestaurantTable)
    private readonly tableRepo: Repository<RestaurantTable>,
    @InjectRepository(Area)
    private readonly areaRepo: Repository<Area>,
    private readonly ds: DataSource,
    @InjectRepository
      (Invoice)
    private readonly invoiceRepo: Repository<Invoice>,

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

  // lấy danh sách bàn
  async findAll({ page = 1, limit = 12, area, search, status }: QueryTableDto) {
    try {
      // ép kiểu & clamp đề phòng query string
      page = Math.max(1, Math.floor(Number(page)));
      limit = Math.max(1, Math.floor(Number(limit)));

      const qb = this.tableRepo
        .createQueryBuilder('t')
        .leftJoin('t.area', 'a')
        .addSelect(['a.id', 'a.name'])
        .orderBy('t.name', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const isPostgres =
        (this.tableRepo.manager.connection.options as any).type === 'postgres';

      if (area?.trim()) {
        qb.andWhere(isPostgres ? 'a.name ILIKE :area' : 'a.name LIKE :area', { area: `%${area}%` });
      }

      if (search?.trim()) {
        qb.andWhere(isPostgres ? 't.name ILIKE :search' : 't.name LIKE :search', { search: `%${search}%` });
      }

      // đừng dùng if (status) vì 'INACTIVE' cũng truthy/falsey mơ hồ
      if (typeof status !== 'undefined' && status !== null) {
        qb.andWhere('t.status = :status', { status }); // ACTIVE / INACTIVE
      }

      const [rows, total] = await qb.getManyAndCount();

      const meta: PageMeta = {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 0,
      };

      // ✅ data là mảng, meta nằm riêng trong envelope
      return new ResponseCommon<RestaurantTable[], PageMeta>(
        200,
        true,
        'Lấy danh sách bàn thành công',
        rows,
        meta,
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'Không thể lấy danh sách bàn');
    }
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


  async getTableTransactions(
    tableId: string,
    q: TableTransactionsQueryDto,
  ): Promise<TableTransactionsResp> {
    const { page = 1, limit = 10, status } = q;

    // base for count
    const baseQb = this.ds.getRepository(Invoice)
      .createQueryBuilder('inv')
      .leftJoin('inv.order', 'ord')
      .leftJoin('ord.table', 'tbl')
      .leftJoin('inv.cashier', 'cashier')
      .leftJoin('ord.createdBy', 'ob')
      .where('tbl.id = :tableId', { tableId });

    if (status) baseQb.andWhere('inv.status = :status', { status });

    // data query
    const qb = baseQb.clone()
      .leftJoin('cashier.profile', 'cashierProf')
      .leftJoin('ob.profile', 'obProf')
      .select([
        'inv.id AS "invoiceId"',
        'inv.invoice_number AS "invoiceNumber"',
        'inv.created_at AS "createdAt"',
        'inv.total_amount AS "totalAmount"',
        'inv.status AS "status"',
      ])
      .addSelect('cashier.id', 'cashierId')
      .addSelect(
        `COALESCE(cashierProf.full_name, cashier.username, cashier.email)`,
        'cashierName',
      )
      .addSelect('ob.id', 'orderedById')
      .addSelect(
        `COALESCE(obProf.full_name, ob.username, ob.email)`,
        'orderedByName',
      )
      .orderBy('inv.created_at', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const [rows, totalRow] = await Promise.all([
      qb.getRawMany<{
        invoiceId: string;
        invoiceNumber: string;
        createdAt: Date | string;
        totalAmount: string;
        status: string;
        cashierId: string | null;
        cashierName: string | null;
        orderedById: string | null;
        orderedByName: string | null;
      }>(),
      baseQb.clone().select('COUNT(*)', 'cnt').getRawOne<{ cnt: string }>(),
    ]);

    const total = Number(totalRow?.cnt ?? 0);

    return {
      items: rows.map((r) => ({
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        createdAt: new Date(r.createdAt as any).toISOString(),
        totalAmount: r.totalAmount,
        status: r.status,
        cashier: {
          id: r.cashierId ?? null,
          name: r.cashierName ?? null,
        },
        orderedBy: {
          id: r.orderedById ?? null,
          name: r.orderedByName ?? null,
        },
      })),
      meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }


}