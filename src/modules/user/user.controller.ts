import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller('user')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) { }

  // this endpoint for create new user (admin only)
  @Post('/create-user')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo nhân viên mới [ADMIM]' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }
}
