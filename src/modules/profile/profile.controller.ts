import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '../user/entities/user.entity';
import { Profile } from './entities/profile.entity';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ProfileResponseDto } from './dto/profile-response.dto';

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

}
