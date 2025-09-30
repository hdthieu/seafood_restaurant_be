import {
  Controller, Post, Body, BadRequestException, UseInterceptors,
  UploadedFile, HttpCode, HttpStatus,
  Query,
  Get,
  ParseUUIDPipe,
  Param
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { FileFilterCallback } from 'multer';
import type { Express } from 'express';

import { MenuitemsService } from './menuitems.service';
import { CreateMenuItemDto } from './dto/create-menuitem.dto';
import { GetMenuItemsDto } from './dto/list-menuitem.dto';

@Controller('menuitems')
@ApiBearerAuth()
export class MenuitemsController {
  constructor(private readonly menuitemsService: MenuitemsService) { }

  @Post('/create-menuitem')
  @ApiOperation({ summary: 'Tạo món (ảnh chỉ nhận file upload)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb: FileFilterCallback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.mimetype)) 
        return cb(new BadRequestException('IMAGE_TYPE_NOT_ALLOWED') as any, false);
      cb(null, true);
    },
  }))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateMenuItemDto,
  ) {
    if (!file) throw new BadRequestException('IMAGE_FILE_REQUIRED');

    // body.ingredients đã là array nhờ @Transform
    return this.menuitemsService.createMenuItem(
      {
        name: body.name,
        price: body.price,
        description: body.description,
        categoryId: body.categoryId,
        ingredients: body.ingredients,
      },
      file,
    );
  }

  @Get('/list-menuitems')
  @ApiOperation({ summary: 'Lấy danh sách thực đơn (phân trang, lọc, tìm kiếm)' })
  @ApiOkResponse({
    description: 'Danh sách món + meta phân trang',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/MenuItem' },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  async getList(@Query() dto: GetMenuItemsDto) {
    return this.menuitemsService.getList(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết 1 món (kèm category + ingredients)' })
  @ApiParam({ name: 'id', description: 'UUID của món', type: 'string' })
  async getDetail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.menuitemsService.getDetail(id);
  }
}
