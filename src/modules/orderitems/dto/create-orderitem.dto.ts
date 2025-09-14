import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { IsInt } from 'class-validator';

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

  //  NEW: cho phép client gửi batchId để gom “một lần báo”
  @IsOptional()
  @IsString()
  batchId?: string;
}
