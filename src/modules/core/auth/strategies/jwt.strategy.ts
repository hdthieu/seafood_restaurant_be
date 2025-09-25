/* eslint-disable prettier/prettier */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly cfg: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // DÙNG ACCESS SECRET (khớp với cách bạn sign access token trong AuthService)
            secretOrKey: cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
    }

    async validate(payload: any) {
        // Ngăn refresh token dùng cho API protected
        if (payload?.typ && payload.typ !== 'access') {
            throw new UnauthorizedException('Invalid token type');
        }

        // Nếu muốn kiểm tra user ở DB, có thể làm ở đây (gọn nhất trả payload)
        return { id: payload.sub, email: payload.email, role: payload.role };
    }
}
