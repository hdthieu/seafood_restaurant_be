/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UserService } from 'src/modules/user/user.service';
import { User } from 'src/modules/user/entities/user.entity';
import { LoginUserDto } from './dto/login-user.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
    ) { }

    // ===== Helpers =====
    private getAccessOptions() {
        return {
            secret: process.env.JWT_ACCESS_SECRET!,
            expiresIn: process.env.JWT_ACCESS_EXPIRES || '120m',
        };
    }

    private getRefreshOptions() {
        return {
            secret: process.env.JWT_REFRESH_SECRET!,
            expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
        };
    }

    private calcRefreshExpiryDate(): Date {
        const str = String(process.env.JWT_REFRESH_EXPIRES || '30d');
        const days = /(\d+)d/i.test(str) ? parseInt(RegExp.$1, 10) : 30;
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    private async generateTokens(user: User): Promise<TokenResponseDto> {
        const jti = randomUUID();
        const base = { sub: user.id, email: user.email, role: user.role };

        const accessToken = this.jwtService.sign({ ...base, jti, typ: 'access' }, this.getAccessOptions());
        const refreshToken = this.jwtService.sign({ ...base, jti, typ: 'refresh' }, this.getRefreshOptions());

        return { accessToken, refreshToken };
    }

    private async setRefreshToken(user: User, rawRefreshToken: string) {
        user.refreshToken = await bcrypt.hash(rawRefreshToken, 10);
        user.refreshTokenExpiry = this.calcRefreshExpiryDate();
        await this.userService.save(user);
    }

    // ===== Core logic =====
    async validateUser(email: string, password: string): Promise<User> {
        const user = await this.userService.findByEmail(email);

        if (!user) {
            throw new ResponseException('Thông tin đăng nhập không hợp lệ', 401);
        }
        if (user.status !== 'ACTIVE') {
            throw new ResponseException('Tài khoản đã bị khóa', 403);
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            throw new ResponseException('Thông tin đăng nhập không hợp lệ', 401);
        }
        return user;
    }

    async login(dto: LoginUserDto): Promise<ResponseCommon<TokenResponseDto>> {
        try {
            const user = await this.validateUser(dto.email, dto.password);

            const tokens = await this.generateTokens(user);
            await this.setRefreshToken(user, tokens.refreshToken);

            user.lastLogin = new Date();
            await this.userService.save(user);

            return new ResponseCommon<TokenResponseDto>(200, true, 'Đăng nhập thành công', tokens);
        } catch (error) {
            throw new ResponseException(error, 500);
        }
    }

    async refreshToken(oldRefreshToken: string): Promise<ResponseCommon<TokenResponseDto>> {
        try {
            const payload = this.jwtService.verify(oldRefreshToken, {
                secret: process.env.JWT_REFRESH_SECRET!,
            }) as any;

            if (payload?.typ !== 'refresh') {
                throw new ResponseException('Refresh token không hợp lệ', 401);
            }

            const user = await this.userService.findById(payload.sub);
            if (!user || !user.refreshToken || !user.refreshTokenExpiry) {
                throw new ResponseException('Refresh token không hợp lệ', 401);
            }

            if (new Date() > user.refreshTokenExpiry) {
                user.refreshToken = null;
                user.refreshTokenExpiry = null;
                await this.userService.save(user);
                throw new ResponseException('Refresh token đã hết hạn', 401);
            }

            const match = await bcrypt.compare(oldRefreshToken, user.refreshToken);
            if (!match) {
                user.refreshToken = null;
                user.refreshTokenExpiry = null;
                await this.userService.save(user);
                throw new ResponseException('Refresh token bị từ chối', 401);
            }

            const tokens = await this.generateTokens(user);
            await this.setRefreshToken(user, tokens.refreshToken);

            return new ResponseCommon<TokenResponseDto>(200, true, 'Làm mới token thành công', tokens);
        } catch (error) {
            throw new ResponseException(error, 500);
        }
    }

    async logout(userId: string): Promise<ResponseCommon<null>> {
        try {
            const user = await this.userService.findById(userId);
            if (user) {
                user.refreshToken = null;
                user.refreshTokenExpiry = null;
                await this.userService.save(user);
            }
            return new ResponseCommon<null>(200, true, 'Đăng xuất thành công', null);
        } catch (error) {
            throw new ResponseException(error, 500);
        }
    }
}
