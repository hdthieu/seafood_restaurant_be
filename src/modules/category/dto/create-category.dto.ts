import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { CategoryType } from "src/common/enums";

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

}
