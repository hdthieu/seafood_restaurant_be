import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRole, UserStatus } from 'src/common/enums';
import { Profile } from '../profile/entities/profile.entity';
import * as bcrypt from 'bcrypt';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { QueryUserDto } from './dto/query-user.dto';
import { Brackets } from 'typeorm';
@Injectable()
export class UserService {

  constructor(
    @InjectRepository(User)
    private readonly userRepository: any,
    @InjectRepository(Profile)
    private readonly profileRepository: any,
  ) { }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async save(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      username: dto.username,
      password: hashedPassword,
      role: dto.role,
      status: UserStatus.ACTIVE,
      profile: dto.profile ? this.profileRepository.create(dto.profile) : undefined,
    });

    return this.userRepository.save(user);
  }

  // function get list user
  async getListUser(q: QueryUserDto, currentUserId: string) {
    try {
      // chuẩn hóa page/limit
      const page = Math.max(1, Number(q.page || 1));
      const limit = Math.min(100, Math.max(1, Number(q.limit || 10)));

      const qb = this.userRepository
        .createQueryBuilder('u')
        .leftJoin('u.profile', 'p')
        .select([
          'u.id',
          'u.email',
          'u.phoneNumber',
          'u.username',
          'u.role',
          'u.createdAt',        // cần cho ORDER BY
          'p.fullName',
        ])
        .where('u.isDelete = false')
        .andWhere('u.id != :currentUserId', { currentUserId });

      // search server-side (tránh ILIKE '%%')
      const kw = q.q?.trim();
      if (kw) {
        const s = `%${kw.toLowerCase()}%`;
        qb.andWhere(new Brackets(w => {
          w.where('LOWER(u.email) LIKE :s', { s })
            .orWhere('LOWER(u.username) LIKE :s', { s })
            .orWhere('LOWER(p.fullName) LIKE :s', { s })
            .orWhere('u.phoneNumber LIKE :s', { s });
        }));
      }

      qb.orderBy('u.createdAt', 'DESC').addOrderBy('u.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const [rows, total] = await qb.getManyAndCount();

      // map DTO trả ra
      const items = rows.map(u => ({
        id: u.id,
        email: u.email ?? null,
        phoneNumber: u.phoneNumber ?? null,
        username: u.username ?? null,
        role: u.role,
        profile: { fullName: u.profile?.fullName ?? null },
      }));

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách người dùng thành công',
        items,
        { total, page, limit, pages: Math.ceil(total / limit) || 0 },
      );
    } catch (err) {
      throw new ResponseException(err, 500, 'Không thể lấy danh sách người dùng');
    }
  }


}
