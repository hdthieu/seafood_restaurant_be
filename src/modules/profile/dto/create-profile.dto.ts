
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Length(1, 150)
  fullName: string;

  @ApiPropertyOptional({ example: '2000-01-01', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dob?: string; // dùng string ISO thay vì Date để Swagger hiển thị đúng

  @ApiPropertyOptional({ example: '123 Lê Lợi, Q.1' })
  @IsOptional()
  @IsString()
  address?: string;
}
