import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { User } from './entities/user.entity';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { QueryUserDto } from './dto/query-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  // this endpoint for create new user (MANAGER only)
  @Post('/create-user')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo nhân viên mới [MANAGER]' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  // this endpoint for get list user (MANAGER only)
  @Get('get-list-user')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách nhân viên [MANAGER]' })
  async getListUser(
    @Query() q: QueryUserDto,
    @CurrentUser() user: User,
  ) {
    return this.userService.getListUser(q, user.id);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Quên mật khẩu (Gửi OTP qua Email)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.userService.forgotPassword(dto.email);
  }

  // API 2: Nhập Email + OTP + Pass mới -> Đổi pass
  @Post('reset-password')
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto);
  }
}
