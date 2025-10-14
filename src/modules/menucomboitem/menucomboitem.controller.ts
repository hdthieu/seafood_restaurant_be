import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  HttpCode,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiConsumes,
  ApiExtraModels,
  getSchemaPath,
  ApiQuery,
} from '@nestjs/swagger';
import { MenucomboitemService } from './menucomboitem.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileFilterCallback, memoryStorage } from 'multer';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ComboComponentDto } from './dto/combo-component.dto';
import { JwtAuthGuard } from '@modules/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/core/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { ListCombosDto } from './dto/ListCombosDto.dto';

@ApiTags('Menu Combos')
@Controller('menucomboitem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenucomboitemController {
  constructor(private readonly service: MenucomboitemService) { }

  // menucomboitem.controller.ts
  @Post('/create')
  @ApiOperation({ summary: 'Create fixed combo (upload image)' })
  @ApiConsumes('multipart/form-data')
  @Roles(UserRole.MANAGER)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'comboPrice', 'components', 'image'],
      properties: {
        name: { type: 'string' },
        comboPrice: { type: 'number' },
        description: { type: 'string' },
        isAvailable: { type: 'boolean' },
        components: {
          type: 'string',
          example: JSON.stringify([
            { itemId: 'uuid-lau-hai-san', quantity: 1 },
            { itemId: 'uuid-coca-330', quantity: 1 },
          ]),
        },
        image: { type: 'string', format: 'binary' },
      },
    },
  })

  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb: FileFilterCallback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.mimetype))
        return cb(new ResponseCommon(400, false, 'IMAGE_TYPE_NOT_ALLOWED') as any, false);
      cb(null, true);
    },
  }))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateComboDto,
  ) {
    if (!file) throw new ResponseCommon(400, false, 'IMAGE_FILE_REQUIRED');
    return this.service.create(body, file);
  }

  @Get('/list')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOkResponse({ description: 'List all combos with pagination' })
  @ApiOperation({ summary: 'List combos with filters & pagination' })
  findAll(@Query() query: ListCombosDto) {
    return this.service.findAll(query);
  }

  @Get('getinfo/:id')
  @ApiOperation({ summary: 'Get combo detail (with components)' })
  @ApiOkResponse({ description: 'Combo detail' })
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update combo (upload image if provided)' })
  @ApiConsumes('multipart/form-data')
  @Roles(UserRole.MANAGER)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'comboPrice', 'components', 'image'],
      properties: {
        name: { type: 'string' },
        comboPrice: { type: 'number' },
        description: { type: 'string' },
        isAvailable: { type: 'boolean' },
        components: {
          type: 'string',
          example: JSON.stringify([
            { itemId: 'uuid-lau-hai-san', quantity: 1 },
            { itemId: 'uuid-coca-330', quantity: 1 },
          ]),
        },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb: FileFilterCallback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.mimetype))
        return cb(new ResponseCommon(400, false, 'IMAGE_TYPE_NOT_ALLOWED') as any, false);
      cb(null, true);
    },
  }))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UpdateComboDto,
  ) {
    return this.service.update(id, body, file);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Delete combo' })
  @ApiOkResponse({ description: 'Delete success' })
  @Roles(UserRole.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }

}