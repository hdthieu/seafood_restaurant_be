import { Expose } from 'class-transformer';

export class UserResponseDto {
    @Expose() id: string;
    @Expose() email: string;
    @Expose() phoneNumber: string;
    @Expose() username: string;

    @Expose() role: string;
    @Expose() status: string;
    @Expose() isActive: boolean;
    @Expose() lastLogin: Date;

    @Expose() createdAt: Date;
    @Expose() updatedAt: Date;
}
