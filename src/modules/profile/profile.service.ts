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
import { ConfigS3Service } from 'src/common/AWS/config-s3/config-s3.service';

@Injectable()
export class ProfileService {
  constructor(@InjectRepository(Profile)
  private readonly profileRepository: Repository<Profile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configS3Service: ConfigS3Service,
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

  // function update profile
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    avatar?: Express.Multer.File,
  ) {
    // Tìm user + profile
    const user = await this.userRepository.findOne({
      where: { id: userId, isDelete: false },
      relations: ['profile'],
    });
    if (!user) throw new ResponseCommon(404, false, 'USER_NOT_FOUND');

    // Nếu chưa có profile thì khởi tạo mới
    let profile = user.profile;
    if (!profile) {
      profile = this.profileRepository.create({ user });
    }

    // Map dữ liệu DTO
    if (dto.fullName !== undefined) profile.fullName = dto.fullName.trim();
    if (dto.dob !== undefined) {
      // dob từ client dạng string -> Date
      const d = new Date(dto.dob as any);
      if (isNaN(d.getTime())) throw new ResponseCommon(400, false, 'DOB_INVALID');
      profile.dob = d;
    }
    if (dto.description !== undefined) profile.description = dto.description?.trim();
    if (dto.address !== undefined) profile.address = dto.address?.trim();
    if (dto.city !== undefined) profile.city = dto.city?.trim();
    if (dto.country !== undefined) (profile as any).country = dto.country as any;

    if (dto.addressList !== undefined) {
      // Cho phép client gửi JSON string hoặc text thường
      // Nếu là JSON hợp lệ -> lưu nguyên bản, còn không -> lưu text
      try {
        const parsed = JSON.parse(dto.addressList);
        if (!Array.isArray(parsed)) throw new Error();
        profile.addressList = JSON.stringify(parsed);
      } catch {
        profile.addressList = dto.addressList;
      }
    }

    // Upload avatar nếu có file
    if (avatar) {
      // key: avatars/<uuid or timestamp>-<originalname>
      const key = await this.configS3Service.uploadBuffer(avatar.buffer, avatar.mimetype, 'avatars');
      const imageUrl = this.configS3Service.makeS3Url(key);
      profile.avatar = imageUrl;
    }

    // Lưu profile
    const saved = await this.profileRepository.save(profile);

    // Trả về profile đầy đủ (nếu cần relations khác thì thêm vào)
    return saved;
  }

}
