import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useBodyParser('json', { limit: '3mb' }); // clock-in selfies are sent as data URLs
  app.useBodyParser('urlencoded', { extended: true }); // Billplz callbacks are form-encoded
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim());
  app.enableCors({ origin: (o, cb) => cb(null, !o || origins.includes('*') || origins.includes(o)), credentials: false });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
