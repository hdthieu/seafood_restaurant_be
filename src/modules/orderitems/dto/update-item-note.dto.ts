import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateItemNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
