import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const hasSupabaseConfig =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;

const describeIfConfigured = hasSupabaseConfig ? describe : describe.skip;

describeIfConfigured('GetDraft API (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ─── Health ───
  describe('Health Check', () => {
    it('GET /api/health should return 200', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe('ok');
        });
    });
  });

  // ─── Auth (validation) ───
  describe('Auth Validation', () => {
    it('POST /api/auth/signup should reject missing fields', () => {
      return request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({})
        .expect(400);
    });

    it('POST /api/auth/signup should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'not-an-email',
          password: 'Password123!',
          role: 'athlete',
          name: 'Test',
        })
        .expect(400);
    });

    it('POST /api/auth/signup should reject invalid role', () => {
      return request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'test@test.com',
          password: 'Password123!',
          role: 'invalid_role',
          name: 'Test',
        })
        .expect(400);
    });

    it('POST /api/auth/login should reject missing fields', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });

    it('POST /api/auth/forgot-password should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'not-email' })
        .expect(400);
    });
  });

  // ─── Protected Routes ───
  describe('Protected Routes (no auth)', () => {
    it('GET /api/users/me should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/users/me').expect(401);
    });

    it('GET /api/discover/feed should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/discover/feed').expect(401);
    });

    it('GET /api/matches should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/matches').expect(401);
    });

    it('GET /api/chat/threads should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/chat/threads').expect(401);
    });

    it('GET /api/subscriptions/me should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/subscriptions/me')
        .expect(401);
    });

    it('POST /api/discover/swipe should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/discover/swipe')
        .send({ targetUserId: 'uuid', direction: 'draft' })
        .expect(401);
    });

    it('GET /api/admin/users should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/admin/users').expect(401);
    });
  });

  // ─── Public Routes ───
  describe('Public Routes', () => {
    it('GET /api/stats/globe should return 200', () => {
      return request(app.getHttpServer()).get('/api/stats/globe').expect(200);
    });

    it('GET /api/stats/welcome should return 200', () => {
      return request(app.getHttpServer()).get('/api/stats/welcome').expect(200);
    });
  });
});

// Always-run tests (no Supabase needed)
describe('GetDraft API (offline)', () => {
  it('should have SUPABASE_URL requirement documented', () => {
    // This test always passes — it documents that E2E tests need env vars
    expect(true).toBe(true);
    if (!hasSupabaseConfig) {
      console.log(
        '⚠️  E2E tests skipped: set SUPABASE_URL and SUPABASE_ANON_KEY env vars to run full E2E suite',
      );
    }
  });
});
