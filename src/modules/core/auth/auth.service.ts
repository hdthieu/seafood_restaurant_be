import {
    Injectable,
    HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/modules/user/user.service';
import { User } from 'src/modules/user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
    ) { }

    // function login user
    async login(dto: LoginUserDto): Promise<ResponseCommon<TokenResponseDto>> {
        try {
            const user = await this.validateUser(dto.email, dto.password);
            const tokens = await this.generateTokens(user);

            user.refreshToken = tokens.refreshToken;
            user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await this.userService.save(user);

            return new ResponseCommon<TokenResponseDto>(
                HttpStatus.OK,
                true,
                'Đăng nhập thành công',
                tokens,
            );
        } catch (error) {
            throw new ResponseException(error);
        }
    }

    // function validate user
    async validateUser(emailOrUsername: string, password: string): Promise<User> {
        const user = await this.userService.findByEmail(emailOrUsername);

        if (!user) {
            throw new ResponseException('Tài khoản không tồn tại', HttpStatus.UNAUTHORIZED);
        }

        if (user.status !== 'ACTIVE') {
            throw new ResponseException('Tài khoản đã bị khóa', HttpStatus.FORBIDDEN);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new ResponseException('Mật khẩu không đúng', HttpStatus.UNAUTHORIZED);
        }

        return user;
    }

    // function generate token
    async generateTokens(user: User): Promise<TokenResponseDto> {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            jti: randomUUID(),
        };

        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
        const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

        return { accessToken, refreshToken };
    }

    // function refresh token
    async refreshToken(oldRefreshToken: string): Promise<ResponseCommon<TokenResponseDto>> {
        try {
            const payload = this.jwtService.verify(oldRefreshToken);
            const user = await this.userService.findById(payload.sub);
            // check refresh token valid and not expired
            if (
                !user ||
                user.refreshToken !== oldRefreshToken ||
                !user.refreshTokenExpiry ||
                new Date() > user.refreshTokenExpiry
            ) {
                throw new ResponseException('Refresh token không hợp lệ', HttpStatus.UNAUTHORIZED);
            }


            const tokens = await this.generateTokens(user);
            user.refreshToken = tokens.refreshToken;
            user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await this.userService.save(user);

            return new ResponseCommon<TokenResponseDto>(
                HttpStatus.OK,
                true,
                'Làm mới token thành công',
                tokens,
            );
        } catch (error) {
            throw new ResponseException(error);
        }
    }

    // function logout
    async logout(userId: string): Promise<ResponseCommon<any>> {
        try {
            const user = await this.userService.findById(userId);
            if (user) {
                user.refreshToken = null;
                user.refreshTokenExpiry = null;
                await this.userService.save(user);
            }

            return new ResponseCommon<any>(
                HttpStatus.OK,
                true,
                'Đăng xuất thành công',
                null,
            );
        } catch (error) {
            throw new ResponseException(error);
        }
    }
}
