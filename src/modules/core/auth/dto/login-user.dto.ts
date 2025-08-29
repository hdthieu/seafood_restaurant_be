import { IsNotEmpty, IsEmail, MaxLength, IsString, isString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
    // @MaxLength(200)
    // //@IsEmail()
    // @ApiProperty()
    // email?: string;

    //@MaxLength(200)
    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;


    @MaxLength(128)
    @ApiProperty()
    password: string;
}