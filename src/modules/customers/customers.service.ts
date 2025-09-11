import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Customer } from './entities/customers.entity';
import { Order } from '../order/entities/order.entity';

type CreateCustomerDto = {
  name: string;
  phone?: string;
  email?: string;
  gender?: string;         // hoặc enum của bạn
  birthday?: string;       // 'YYYY-MM-DD'
  address?: string;
  code?: string;           // cho phép truyền, nếu không sẽ gen
};

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
      code: dto.code ?? this.genCode(),
      name: dto.name.trim(),
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      gender: dto.gender ?? null,
      birthday: dto.birthday ? new Date(dto.birthday) : null,
      address: dto.address ?? null,
      isWalkin: false,
    });

    try {
      return await this.cusRepo.save(entity);
    } catch (e: any) {
      if (e?.code === '23505') {
        // unique violation (phone/code)
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
}
