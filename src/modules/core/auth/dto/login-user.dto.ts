import { IsNotEmpty, IsEmail, MaxLength, IsString, isString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: 'Email không đúng định dạng' })
    @IsNotEmpty({ message: 'Email không được để trống' })
    email: string;

    @ApiProperty({ example: 'MyP@ssw0rd' })
    @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
    @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
    @MaxLength(128, { message: 'Mật khẩu tối đa 128 ký tự' })
    @Matches(/^(?=.*[A-Z])(?=.*[^A-Za-z0-9])[\S]{8,}$/, {
        message:
            'Mật khẩu phải có ít nhất 1 chữ hoa, 1 ký tự đặc biệt và không chứa khoảng trắng',
    })
    password: string;

}