import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { User } from './entities/user.entity';
import { CurrentUser } from 'src/common/decorators/user.decorator';
import { QueryUserDto } from './dto/query-user.dto';

@Controller('user')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) { }

  // this endpoint for create new user (MANAGER only)
  @Post('/create-user')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo nhân viên mới [MANAGER]' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  // this endpoint for get list user (MANAGER only)
  @Get('get-list-user')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách nhân viên [MANAGER]' })
  async getListUser(
    @Query() q: QueryUserDto,
    @CurrentUser() user: User,
  ) {
    return this.userService.getListUser(q, user.id);
  }


}
