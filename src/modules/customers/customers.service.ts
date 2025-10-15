import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Customer } from './entities/customers.entity';
import { Order } from '../order/entities/order.entity';
import { Brackets } from 'typeorm';
import { CreateCustomerDto } from './dtos/create-customers.dto';
import { CustomersFilterDto } from './dtos/customers-filter.dto';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { CustomerInvoiceRow } from './dtos/query-customer-history.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { DataSource } from 'typeorm';
import { UpdateCustomerDto } from './dtos/update-customer.dto';


@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly cusRepo: Repository<Customer>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  private readonly ds: DataSource

  ) { }

  // ===== helpers =====
  private genCode(): string {
    // VD: CUS-250911-1234
    const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const rnd = Math.floor(Math.random() * 9000 + 1000);
    return `CUS-${ymd}-${rnd}`;
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    // page bắt đầu từ 1
    const [data, total] = await this.cusRepo.findAndCount({
      where: { isWalkin: false },   // nếu muốn loại bỏ khách vãng lai
      order: { createdAt: 'DESC' }, // sắp xếp mới nhất trước
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }
async getDetail(id: string): Promise<Customer> {
    const c = await this.cusRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('CUSTOMER_NOT_FOUND');
    return c;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const c = await this.cusRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('CUSTOMER_NOT_FOUND');

    Object.assign(c, {
      name: dto.name ?? c.name,
      phone: dto.phone ?? c.phone,
      email: dto.email ?? c.email,
      type: dto.type ?? c.type,
      gender: dto.gender ?? c.gender,
      birthday: dto.birthday ? new Date(dto.birthday) : c.birthday,
      address: dto.address ?? c.address,
      province: dto.province ?? c.province,
      district: dto.district ?? c.district,
      ward: dto.ward ?? c.ward,
    });

    try {
      return await this.cusRepo.save(c);
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('DUPLICATE_FIELD');
      throw e;
    }
  }
  // ===== APIs =====
  async getOrCreateWalkin(): Promise<Customer> {
    let c = await this.cusRepo.findOne({ where: { isWalkin: true } });
    if (c) return c;

    const entity = this.cusRepo.create({
      code: 'WALKIN',
      name: 'Khách lẻ',
      isWalkin: true,
      phone: null,
      email: null,
      gender: null,
      birthday: null,
      address: null,
    }); // <-- create với OBJECT, KHÔNG bọc mảng []

    return this.cusRepo.save(entity);
  }


  async create(dto: CreateCustomerDto): Promise<Customer> {
    if (!dto.name?.trim()) throw new BadRequestException('NAME_REQUIRED');

    const entity = this.cusRepo.create({
      type: dto.type,                                   // PERSONAL | COMPANY
      code: dto.code ?? this.genCode(),
      name: dto.name.trim(),
      companyName: dto.companyName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      gender: dto.gender ?? null,
      birthday: dto.birthday ? new Date(dto.birthday) : null,
      address: dto.address ?? null,
      province: dto.province ?? null,
      district: dto.district ?? null,
      ward: dto.ward ?? null,
      taxNo: dto.taxNo ?? null,
      identityNo: dto.identityNo ?? null,
      isWalkin: false,
    });

    try {
      return await this.cusRepo.save(entity);
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException('Số điện thoại hoặc mã đã tồn tại');
      }
      throw e;
    }
  }

 

  async search(q: string, limit = 10) {
    if (!q?.trim()) return [];
    const key = `%${q.trim()}%`;

    // đơn giản: tìm theo name (ILIKE) hoặc phone
    const rows = await this.cusRepo.find({
      where: [
        { isWalkin: false, name: ILike(key) },
        { isWalkin: false, phone: ILike(key) },
      ],
      order: { updatedAt: 'DESC' },
      take: limit,
      select: { id: true, name: true, phone: true, code: true },
    });
    return rows;
  }






  async filterAndPaginate(dto: CustomersFilterDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    const qb = this.cusRepo.createQueryBuilder('c')
      .where('c.isWalkin = :w', { w: false });

    // q: tìm theo code/name/phone/email
    if (dto.q?.trim()) {
      const key = `%${dto.q.trim()}%`;
      qb.andWhere(new Brackets(b => {
        b.where('c.code ILIKE :key', { key })
          .orWhere('c.name ILIKE :key', { key })
          .orWhere('c.phone ILIKE :key', { key })
          .orWhere('c.email ILIKE :key', { key });
      }));
    }

    if (dto.type) qb.andWhere('c.type = :type', { type: dto.type });
    if (dto.gender) qb.andWhere('c.gender = :gender', { gender: dto.gender });

    // created_at range
    if (dto.createdFrom) qb.andWhere('c.created_at >= :cf', { cf: dto.createdFrom });
    if (dto.createdTo) qb.andWhere('c.created_at <  :ct', { ct: dto.createdTo + ' 23:59:59' });

    // birthday range (cột date)
    if (dto.birthdayFrom) qb.andWhere('c.birthday >= :bf', { bf: dto.birthdayFrom });
    if (dto.birthdayTo) qb.andWhere('c.birthday <= :bt', { bt: dto.birthdayTo });

    if (dto.province) qb.andWhere('c.province ILIKE :prov', { prov: `%${dto.province}%` });
    if (dto.district) qb.andWhere('c.district ILIKE :dist', { dist: `%${dto.district}%` });
    if (dto.ward) qb.andWhere('c.ward ILIKE :ward', { ward: `%${dto.ward}%` });

    qb.orderBy('c.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // this function is used in OrderService (function attachCustomer)
  async findById(id: string): Promise<Customer> {
    const c = await this.cusRepo.findOne({ where: { id } });
    if (!c) throw new ResponseCommon(404, false, 'CUSTOMER_NOT_FOUND');
    return c;
  }





// src/modules/invoice/invoice-history.service.ts



  async getInvoicesByCustomer(customerId: string, page = 1, limit = 20) {
    page = Math.max(1, Number(page) || 1);
    limit = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (page - 1) * limit;

    // base query for data
    const qb = this.ds
      .createQueryBuilder()
      .select([
        'inv.id AS "invoiceId"',
        'inv.invoice_number AS "invoiceNumber"',
        'COALESCE(inv.created_at, inv.updated_at) AS "time"', // hoặc completedAt nếu có
        'inv.total_amount::text AS "totalAmount"',
        'inv.status AS "status"',
        'ord."createdById" AS "orderedById"',
        `COALESCE(ob_prof.full_name, ob.username, ob.email) AS "orderedByName"`,
      ])
      .from('invoices', 'inv')
      .leftJoin('orders', 'ord', 'ord.id = inv.order_id')
      .leftJoin('users', 'ob', 'ob.id = ord."createdById"')
      .leftJoin('profiles', 'ob_prof', 'ob_prof.user_id = ob.id') // nếu profile table là 'profiles'
      .where('inv.customer_id = :customerId', { customerId })
      .orderBy('"time"', 'DESC')
      .offset(offset)
      .limit(limit);

    // total count
    const countQb = this.ds
      .createQueryBuilder()
      .select('COUNT(*)', 'cnt')
      .from('invoices', 'inv')
      .where('inv.customer_id = :customerId', { customerId });

    const [rows, cnt] = await Promise.all([qb.getRawMany(), countQb.getRawOne()]);
    const total = Number(cnt?.cnt ?? 0);
    const pages = Math.max(1, Math.ceil(total / limit));

    const items: CustomerInvoiceRow[] = rows.map((r: any) => ({
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      time: new Date(r.time).toISOString(),
      totalAmount: String(r.totalAmount),
      status: r.status,
      orderedBy: { id: r.orderedById ?? null, name: r.orderedByName ?? null },
    }));

    const meta: PageMeta = { total, page, limit, pages };

    return new ResponseCommon(
      200,
      true,
      'Lấy lịch sử hóa đơn thành công',
      { items },
      meta,
    );
  }
}




