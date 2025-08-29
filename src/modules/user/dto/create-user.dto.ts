import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { CreateProfileDto } from 'src/modules/profile/dto/create-profile.dto';
import { UserRole } from 'src/common/enums';

export class CreateUserDto {
    @ApiProperty({ example: 'staff01@restaurant.com' })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ example: '0901234567' })
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional({ example: 'staff01' })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ example: 'Secret@123' })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.WAITER })
    @IsEnum(UserRole)
    role: UserRole;

    @ApiPropertyOptional({ type: () => CreateProfileDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CreateProfileDto)
    profile?: CreateProfileDto;
}