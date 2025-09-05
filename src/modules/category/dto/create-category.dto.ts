import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { CategoryType } from "../entities/category.entity";

export class CreateCategoryDto {

    @ApiProperty({ example: 'Hải sản' })
    @IsString() @IsNotEmpty() @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ example: 'Nhóm các món hải sản' })
    @IsString() @IsOptional() @MaxLength(255)
    description?: string;

    @ApiProperty({ enum: CategoryType, example: CategoryType.MENU })
    @IsEnum(CategoryType)
    type: CategoryType;

    @ApiPropertyOptional({ example: 0 })
    @IsOptional()
    sortOrder?: number;
}
