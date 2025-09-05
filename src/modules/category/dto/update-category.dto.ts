import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { CategoryType } from '../entities/category.entity';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
    // Cho phép đổi type, nhưng service sẽ chặn khi có tham chiếu
    @IsEnum(CategoryType) @IsOptional()
    type?: CategoryType;
  }