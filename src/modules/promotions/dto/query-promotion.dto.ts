import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { ApplyWith } from "src/common/enums";

export class PromotionQueryDto {
    @IsOptional()
    @IsBoolean()
    activeOnly?: boolean;

    @IsOptional()
    @IsEnum(ApplyWith)
    applyWith?: ApplyWith;

    @IsOptional()
    @IsString()
    keyword?: string;
}