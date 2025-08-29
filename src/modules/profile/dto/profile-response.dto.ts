import { Expose, Type } from 'class-transformer';
import { UserResponseDto } from 'src/modules/user/dto/user-response.dto';

export class ProfileResponseDto {
  @Expose() id: string;
  @Expose() fullName: string;
  @Expose() dob: Date;
  @Expose() avatar: string;
  @Expose() description: string;
  @Expose() address: string;
  @Expose() city: string;
  @Expose() country: string;
  @Expose() addressList: string;

  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
  @Expose() createdBy: string;
  @Expose() updatedBy: string;

  @Expose()
  @Type(() => UserResponseDto)
  user: UserResponseDto;
}
