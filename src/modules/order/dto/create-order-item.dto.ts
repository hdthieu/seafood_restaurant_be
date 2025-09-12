import { IsOptional, IsString, IsArray, ValidateNested, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddOneItemDto {
  @IsUUID()
  menuItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddOneItemDto)
  items: AddOneItemDto[];

  // NEW: nhóm lần báo – nếu client không gửi, BE sẽ tự sinh
  @IsOptional()
  @IsString()
  batchId?: string;
}
