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
@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly cusRepo: Repository<Customer>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

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

  /**
   * Tạo mới (nếu chưa có) theo phone, hoặc cập nhật một số field nếu đã tồn tại
   */
  async upsertByPhone(
    phone: string,
    name?: string,
    partial?: Partial<Omit<Customer, 'id' | 'code' | 'isWalkin'>>,
  ): Promise<Customer> {
    if (!phone?.trim()) throw new BadRequestException('PHONE_REQUIRED');

    const existed = await this.cusRepo.findOne({ where: { phone } });
    if (existed) {
      // chỉ gán khi client thực sự gửi (!== undefined)
      if (name !== undefined) existed.name = name?.trim() || existed.name;

      if (partial?.email !== undefined) existed.email = partial.email ?? null;
      if (partial?.address !== undefined)
        existed.address = partial.address ?? null;
      if (partial?.gender !== undefined) existed.gender = partial.gender ?? null;
      if (partial?.birthday !== undefined)
        existed.birthday = partial.birthday
          ? new Date(partial.birthday as any)
          : null;

      return this.cusRepo.save(existed);
    }

    const entity = this.cusRepo.create({
      code: this.genCode(),
      name: name?.trim() || 'Khách',
      phone,
      email: partial?.email ?? null,
      address: partial?.address ?? null,
      gender: partial?.gender ?? null,
      birthday: partial?.birthday ? (partial.birthday as any) : null,
      isWalkin: false,
    });

    return this.cusRepo.save(entity);
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

  async attachToOrder(params: {
    orderId: string;
    customerId?: string;
    walkin?: boolean;
  }) {
    const order = await this.orderRepo.findOne({
      where: { id: params.orderId },
      relations: ['customer'],
    });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

    let customer: Customer | null = null;
    if (params.walkin) {
      customer = await this.getOrCreateWalkin();
    } else if (params.customerId) {
      customer = await this.cusRepo.findOne({
        where: { id: params.customerId },
      });
      if (!customer) throw new NotFoundException('CUSTOMER_NOT_FOUND');
    } else {
      throw new BadRequestException('customerId or walkin is required');
    }

    order.customer = customer;
    // nếu entity Order có cột customerId:
    (order as any).customerId = customer.id;

    await this.orderRepo.save(order);
    return { ok: true, orderId: order.id, customerId: customer.id };
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

  if (dto.type)   qb.andWhere('c.type = :type', { type: dto.type });
  if (dto.gender) qb.andWhere('c.gender = :gender', { gender: dto.gender });

  // created_at range
  if (dto.createdFrom) qb.andWhere('c.created_at >= :cf', { cf: dto.createdFrom });
  if (dto.createdTo)   qb.andWhere('c.created_at <  :ct', { ct: dto.createdTo + ' 23:59:59' });

  // birthday range (cột date)
  if (dto.birthdayFrom) qb.andWhere('c.birthday >= :bf', { bf: dto.birthdayFrom });
  if (dto.birthdayTo)   qb.andWhere('c.birthday <= :bt', { bt: dto.birthdayTo });

  if (dto.province) qb.andWhere('c.province ILIKE :prov', { prov: `%${dto.province}%` });
  if (dto.district) qb.andWhere('c.district ILIKE :dist', { dist: `%${dto.district}%` });
  if (dto.ward)     qb.andWhere('c.ward ILIKE :ward',     { ward: `%${dto.ward}%` });

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

}
