import { IsArray, IsEnum, IsNotEmpty, ArrayNotEmpty, IsUUID } from 'class-validator';
import { ItemStatus } from 'src/common/enums';

export class UpdateItemsStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  itemIds: string[];

  @IsEnum(ItemStatus)
  @IsNotEmpty()
  status: ItemStatus;
}
