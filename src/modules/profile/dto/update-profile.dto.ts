import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';
export class UpdateProfileDto {
    @IsOptional() @IsString() @MaxLength(150)
    fullName?: string;

    @IsOptional() @IsDateString()
    dob?: string; // gửi dạng "YYYY-MM-DD" hoặc ISO 8601

    @IsOptional() @IsString() @MaxLength(500)
    description?: string;

    @IsOptional() @IsString() @MaxLength(250)
    address?: string;

    @IsOptional() @IsString()
    city?: string;

    @IsOptional() @IsString()
    country?: string;

    @IsOptional() @IsString()
    addressList?: string;
}