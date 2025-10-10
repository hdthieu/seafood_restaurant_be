import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePromotionDto } from './create-promotion.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePromotionDto extends CreatePromotionDto {

    @ApiPropertyOptional({ description: 'Không cho phép cập nhật trực tiếp isActive qua endpoint update' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
