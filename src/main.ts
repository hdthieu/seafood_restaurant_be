import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { configurations } from './common/configs';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { join } from 'path';
import * as express from 'express';
import { setDefaultResultOrder } from 'dns';
import { SocketIoAdapter } from './common/socket/socket.io.adapter';
setDefaultResultOrder('ipv4first');
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

}

async function bootstrap() {
  
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,   // <-- Nest sẽ gắn req.rawBody sẵn 
  });
  const origins = process.env.CORS_ORIGIN?.split(",") ?? [];
app.enableCors({
  origin: origins,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
})

  // Override Date.prototype.toJSON to use server timezone
  Date.prototype.toJSON = function () {
    const tzo = -this.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const pad = (num: number) => (num < 10 ? '0' : '') + num;
    
    return this.getFullYear() +
      '-' + pad(this.getMonth() + 1) +
      '-' + pad(this.getDate()) +
      'T' + pad(this.getHours()) +
      ':' + pad(this.getMinutes()) +
      ':' + pad(this.getSeconds()) +
      dif + pad(Math.floor(Math.abs(tzo) / 60)) +
      ':' + pad(Math.abs(tzo) % 60);
  }
  
  // Also override toISOString to use server timezone
  Date.prototype.toISOString = Date.prototype.toJSON;
  
  // Test Date methods after override
  const testDate = new Date();
  
  
  initialSwagger(app);

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads'))); 
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // transformOptions: {
      //   enableImplicitConversion: true,
      // },
    })
  );
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  app.useWebSocketAdapter(new SocketIoAdapter(app)); 
  await app.listen(configurations.port,'0.0.0.0');
  const appUrl = await app.getUrl();
console.log("[LLM BOOT]", {
  pref: process.env.CHAT_PROVIDER_PREF,
  hasGeminiKey: !!process.env.GEMINI_API_KEY,
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  gemModel: process.env.GEMINI_CHAT_MODEL,
  gemBackups: process.env.GEMINI_CHAT_BACKUPS,
  openaiModel: process.env.OPENAI_MODEL,
});
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