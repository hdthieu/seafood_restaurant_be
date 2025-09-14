import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpCode, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { User } from '../user/entities/user.entity';
import { Profile } from './entities/profile.entity';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { FileFilterCallback, memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('profile')
@ApiBearerAuth()
export class ProfileController {

  constructor(private readonly profileService: ProfileService) { }

  // this endpoint for get my profile
  @Get('/me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  async me(@CurrentUser() user: User): Promise<ResponseCommon<ProfileResponseDto>> {
    return this.profileService.getMe(user.id);
  }

  // this endpoint for update profile
  @Patch('/update-profile/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cập nhật profile (avatar nhận file upload — tùy chọn)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Nguyễn Văn A' },
        dob: { type: 'string', format: 'date', example: '1995-12-20' },
        description: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string', example: 'VietNam' },
        addressList: { type: 'string', example: '["Hà Nội","Đà Nẵng"]' },
        avatar: { type: 'string', format: 'binary' }, // file (optional)
      },
    },
  })
  @UseInterceptors(FileInterceptor('avatar', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb: FileFilterCallback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new ResponseCommon(400, false, 'Invalid file type', null) as any, false);
      }
      cb(null, true);
    },
  }))
  async updateProfile(
    @Param('userId') userId: string,
    @UploadedFile() avatar: Express.Multer.File,
    @Body() body: UpdateProfileDto,
  ) {
    // avatar là tùy chọn: không có file vẫn cập nhật các trường khác
    return this.profileService.updateProfile(userId, body, avatar);
  }
}
