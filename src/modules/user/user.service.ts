import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserStatus } from 'src/common/enums';
import { Profile } from '../profile/entities/profile.entity';
import * as bcrypt from 'bcrypt';
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
  async getListUser(currentUserId: string): Promise<any[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.profile', 'profile')
      .select([
        'user.id',
        'user.email',
        'user.phoneNumber',
        'user.username',
        'user.password',
        'user.role',
        'profile.fullName',
      ])
      .where('user.isDelete = false')
      .andWhere('user.id != :currentUserId', { currentUserId })
      .getMany();
  }


}
