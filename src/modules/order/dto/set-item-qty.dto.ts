import { IsInt, Min } from 'class-validator';

export class SetQtyDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}
