import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserStatus } from 'src/common/enums';
import { Profile } from '../profile/entities/profile.entity';
import * as bcrypt from 'bcrypt';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { QueryUserDto } from './dto/query-user.dto';
import { Brackets } from 'typeorm';
import { MailService } from '@modules/mail/mail.service';
@Injectable()
export class UserService {

  constructor(
    @InjectRepository(User)
    private readonly userRepository: any,
    @InjectRepository(Profile)
    private readonly profileRepository: any,
    private readonly mailService: MailService,
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

  // 1. YÊU CẦU QUÊN MẬT KHẨU -> GỬI OTP
  async forgotPassword(email: string) {
    const user = await this.userRepository.findOne({ where: { email, isDelete: false } });
    if (!user) throw new ResponseException(null, 404, 'Email không tồn tại trong hệ thống');

    // Tạo OTP 6 số ngẫu nhiên
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Thời gian hết hạn: hiện tại + 5 phút
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Lưu vào DB
    user.otpCode = otp;
    user.otpExpiresAt = expiresAt;
    await this.userRepository.save(user);

    // Gửi mail (bất đồng bộ để không chặn request lâu)
    this.mailService.sendOtp(email, otp).catch(err => console.error('Lỗi gửi mail:', err));

    return new ResponseCommon(200, true, 'Mã OTP đã được gửi đến email của bạn');
  }

  // 2. XÁC THỰC OTP VÀ ĐỔI PASS
  // user.service.ts

  async resetPassword(dto: { email: string; otp: string; newPassword: string; confirmNewPassword: string }) {

    // 1. Check Confirm Password
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new ResponseException(null, 400, 'Mật khẩu xác nhận không khớp');
    }

    const user = await this.userRepository.findOne({ where: { email: dto.email, isDelete: false } });
    if (!user) throw new ResponseException(null, 404, 'Người dùng không tồn tại');

    // 2. Kiểm tra OTP có tồn tại trong DB không (Trường hợp NULL)
    if (!user.otpCode || !user.otpExpiresAt) {
      // 👇 SỬA LẠI MESSAGE Ở ĐÂY CHO HỢP LÝ HƠN
      throw new ResponseException(null, 400, 'Mã OTP không tồn tại hoặc đã hết hạn. Vui lòng gửi lại mã mới.');
    }

    // 3. Kiểm tra tính chính xác của OTP (So sánh chuỗi)
    if (user.otpCode !== dto.otp) {
      throw new ResponseException(null, 400, 'Mã OTP không chính xác');
    }

    // 4. Kiểm tra thời gian hết hạn (Time check)
    // Trường hợp DB có OTP nhưng thời gian hiện tại > thời gian hết hạn
    if (new Date() > user.otpExpiresAt) {
      throw new ResponseException(null, 400, 'Mã OTP đã hết hạn. Vui lòng lấy mã mới');
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    // Cập nhật user & Xóa OTP để không dùng lại được
    user.password = hashedPassword;
    user.otpCode = null;       // Xóa đi sau khi dùng xong
    user.otpExpiresAt = null;  // Xóa đi sau khi dùng xong

    await this.userRepository.save(user);

    return new ResponseCommon(200, true, 'Đặt lại mật khẩu thành công');
  }

}
