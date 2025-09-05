import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import * as compression from 'compression';
import { AppModule } from './app.module';
import * as rateLimit from 'express-rate-limit';
import { configurations } from './common/configs';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { join } from 'path';
import * as express from 'express';

function initialSwagger(app: NestExpressApplication): void {
  const options = new DocumentBuilder()
    .setTitle('Seafood Restaurant API Document')
    .setDescription('The document about list of API for ECard')
    .setVersion('1.0')
    .addBasicAuth()
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document);
  console.log('[Swagger] API docs available at /api-docs');
}

async function bootstrap() {
  console.log('🚀 Starting NestJS application...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://seafood-restaurant-jnkc49w24-hungdinh1212s-projects.vercel.app',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const configService = app.get<ConfigService>(ConfigService);

  console.log(`[ENV] Environment: ${configurations.nodeEnv}`);
  console.log('[Setup] Applying timezone formatter for Date.prototype.toJSON');

  Date.prototype.toJSON = function () {
    var tzo = -this.getTimezoneOffset(),
      dif = tzo >= 0 ? '+' : '-',
      pad = function (num) {
        return (num < 10 ? '0' : '') + num;
      };
    return this.getFullYear() +
      '-' + pad(this.getMonth() + 1) +
      '-' + pad(this.getDate()) +
      'T' + pad(this.getHours()) +
      ':' + pad(this.getMinutes()) +
      ':' + pad(this.getSeconds()) +
      dif + pad(Math.floor(Math.abs(tzo) / 60)) +
      ':' + pad(Math.abs(tzo) % 60);
  }
  initialSwagger(app);

  app.use('/upload', express.static(join(__dirname, '..', 'upload')));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  await app.listen(configurations.port);
  const appUrl = await app.getUrl();

  console.log(`
  =============================================
  ✅ NestJS Application Started Successfully!
  🔗 URL: ${appUrl}
  📘 Swagger: ${appUrl}/api-docs
  🚪 Port: ${configurations.port}
  🏗  Environment: ${configurations.nodeEnv}
  =============================================
  `);
}

bootstrap();
