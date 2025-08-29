import { Injectable } from '@nestjs/common';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile } from './entities/profile.entity';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { IResponse } from 'src/common/Interfaces/respone.interface';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ProfileService {
  constructor(@InjectRepository(Profile)
  private readonly profileRepository: Repository<Profile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) { }


  // function get my profile
  async getMe(userId: string): Promise<ResponseCommon<ProfileResponseDto>> {
    const currentProfile = await this.profileRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('user.isDelete = false')
      .getOne();

    if (!currentProfile) {
      return new ResponseCommon(404, false, 'Không tìm thấy hồ sơ người dùng');
    }

    const data = plainToInstance(ProfileResponseDto, currentProfile, {
      excludeExtraneousValues: true,
    });

    return new ResponseCommon(200, true, 'Lấy thông tin hồ sơ thành công', data);
  }

}
