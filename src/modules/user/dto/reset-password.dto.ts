import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'nguoidung@gmail.com', description: 'Email tài khoản cần khôi phục' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP được gửi đến email' })
  @IsNotEmpty()
  otp: string;

  @ApiProperty({ example: 'MatKhauMoi123!', description: 'Mật khẩu mới' })
  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' }) // Nên có độ dài tối thiểu
  // 👇 QUAN TRỌNG: Regex kiểm tra điều kiện
  @Matches(/^(?=.*[A-Z])(?=.*[\W_])(?!.*\s).*$/, {
    message: 'Mật khẩu phải có ít nhất 1 chữ hoa, 1 ký tự đặc biệt và không chứa khoảng trắng',
  })
  newPassword: string;

  @ApiProperty({ example: 'MatKhauMoi123!', description: 'Xác nhận mật khẩu mới' })
  @IsNotEmpty()
  confirmNewPassword: string;
}