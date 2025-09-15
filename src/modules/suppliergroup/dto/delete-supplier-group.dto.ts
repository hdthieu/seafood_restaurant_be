import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DeleteSupplierGroupDto {
  @ApiPropertyOptional({
    description: 'ID nhóm đích để chuyển toàn bộ supplier trước khi xoá (nếu nhóm hiện tại còn supplier)',
    example: '4f5a2f4e-9a24-44d7-8b51-3f2de0b9a1c1',
  })
  @IsOptional()
  @IsUUID()
  reassignToId?: string;
}
