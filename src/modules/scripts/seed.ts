import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SeedModule } from './seed.module';
import { SeederService } from '@modules/seeder/seeder.service';

async function bootstrap() {
    const logger = new Logger('Seed');
    logger.log('🌱 Starting seeding...');

    const app = await NestFactory.createApplicationContext(SeedModule, {
        logger: ['log', 'error', 'warn'],
    });

    try {
        const seeder = app.get(SeederService);
        await seeder.seed();
        logger.log('🎉 Seeding finished successfully.');
    } catch (e) {
        logger.error('❌ Seeding failed:', e as any);
        process.exitCode = 1;
    } finally {
        await app.close();
    }
}

bootstrap();
