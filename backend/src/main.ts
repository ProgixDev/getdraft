import { NestFactory } from '@nestjs/core';
import helmet from '@fastify/helmet';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    // Stripe + Didit webhooks verify HMAC signatures over the exact bytes
    // they signed — rawBody must be preserved alongside the parsed body.
    { rawBody: true },
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Security headers. The API is mostly JSON for the mobile app, but it also
  // serves browser-facing HTML at /api/privacy, /api/terms and /api/licenses —
  // the URLs Play Console and the App Store link to — and those were going out
  // with no HSTS, no frame protection and no MIME-sniffing protection.
  //
  // CSP is disabled deliberately: Swagger UI at /docs loads inline scripts and
  // styles, and the default policy blocks it. The HTML this serves is static
  // and takes no user input, so the sniffing and framing headers are what
  // carry the value here.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('GetDraft API')
    .setDescription('Sports recruitment platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`GetDraft API running on port ${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
