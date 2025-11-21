import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QueryCategoryDto } from './dto/query-category.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { CategoryType, UserRole } from 'src/common/enums';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('category')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  @Post('/create-category')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Tạo danh mục (MENU/INGREDIENT) [Only MANAGER]' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Get('/list-category')
  @Roles(UserRole.MANAGER, UserRole.KITCHEN, UserRole.WAITER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Danh sách danh mục + filter/search/paginate' })
  async findAll(@Query() query: QueryCategoryDto) {
    return this.categoryService.findAll(query);
  }

  @Get('/find-category/:id')
  @Roles(UserRole.MANAGER, UserRole.KITCHEN, UserRole.WAITER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Chi tiết danh mục' })
  async findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Patch('/update-category/:id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật danh mục (giữ ràng buộc unique) [MANAGER]' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  @Delete('/delete-category/:id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Xóa danh mục (soft delete: ngừng dùng để bảo tồn dữ liệu) [MANAGER]' })
  async delete(@Param('id') id: string) {
    return this.categoryService.delete(id);
  }
}
