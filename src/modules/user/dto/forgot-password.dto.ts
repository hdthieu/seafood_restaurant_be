import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'nguoidung@gmail.com', description: 'Email tài khoản cần khôi phục' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}