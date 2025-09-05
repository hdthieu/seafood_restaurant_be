import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QueryCategoryDto } from './dto/query-category.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller('category')
@ApiBearerAuth()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  @Post('/create-category')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tạo danh mục (MENU/INGREDIENT) [Only MANAGER]' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Get('/list-category')
  @ApiOperation({ summary: 'Danh sách danh mục + filter/search/paginate' })
  async findAll(@Query() query: QueryCategoryDto) {
    return this.categoryService.findAll(query);
  }

  @Get('/find-category/:id')
  @ApiOperation({ summary: 'Chi tiết danh mục' })
  async findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Patch('/update-category/:id')
  @ApiOperation({ summary: 'Cập nhật danh mục (giữ ràng buộc unique) [MANAGER]' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  // @Patch(':id/toggle')
  // @ApiOperation({ summary: 'Bật/Tắt hoạt động danh mục [MANAGER]' })
  // @HttpCode(HttpStatus.OK)
  // async toggle(@Param('id') id: string) {
  //   return this.categoryService.toggle(id);
  // }

  // @Delete(':id')
  // @ApiOperation({ summary: 'Xoá danh mục (chặn xoá khi đang được tham chiếu)' })
  // async remove(@Param('id') id: string) {
  //   return this.categoryService.remove(id);
  // }
}
