import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SeederModule } from '@modules/seeder/seeder.module';

@Module({
    imports: [
        // Load .env khi chạy script
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env'],
            expandVariables: true,
        }),

        // Kết nối DB giống app (có thể copy y nguyên cấu hình bạn đang dùng)
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                type: 'postgres',
                host: cfg.get<string>('DB_HOST'),
                port: parseInt(cfg.get<string>('DB_PORT', '5432'), 10),
                username: cfg.get<string>('DB_USERNAME'),
                password: cfg.get<string>('DB_PASSWORD'),
                database: cfg.get<string>('DB_DATABASE'),
                autoLoadEntities: true,
                // Dev có thể bật tạm nếu cần, còn lại khuyên false + dùng migration
                synchronize: cfg.get<string>('TYPEORM_SYNC', 'false') === 'true',
                logging: cfg.get<string>('TYPEORM_LOGGING', 'false') === 'true',
                ssl: { rejectUnauthorized: false }, // Railway thường cần
                extra: {
                    connectionTimeoutMillis: parseInt(cfg.get<string>('DB_CONN_TIMEOUT', '3000'), 10),
                    statement_timeout: parseInt(cfg.get<string>('DB_STMT_TIMEOUT', '5000'), 10),
                },
            }),
        }),

        // Chỉ import SeederModule để dùng service seed()
        SeederModule,
    ],
})
export class SeedModule { }
