/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable prettier/prettier */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly cfg: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: cfg.getOrThrow<string>('JWT_SECRET'),
        });
    }
    async validate(payload: any) {
        return { id: payload.sub, email: payload.email, role: payload.role };
    }
}

