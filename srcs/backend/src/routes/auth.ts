import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';

type ApiErrorResponse = {
  error: string;
  message: string;
};

type ManualRegisterBody = {
  email: string;
  nickname: string;
  password: string;
};

type ManualRegisterSuccess = {
  id: number;
  email: string;
  nickname: string;
};

type ManualRegisterReply = ManualRegisterSuccess | ApiErrorResponse;

type GoogleRegisterBody = {
  email: string;
  nickname: string;
  googleId: string;
};

type GoogleRegisterSuccess = {
  id: number;
  email: string;
  nickname: string;
  provider: 'google';
};

type GoogleRegisterReply = GoogleRegisterSuccess | ApiErrorResponse;

type ManualLoginBody = {
  email: string;
  password: string;
};

type GoogleLoginBody = {
  googleId: string;
};

type LoginSuccess = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type SessionStatusResponse = {
  authenticated: boolean;
  user?: LoginSuccess;
};

type ManualLoginReply = LoginSuccess | ApiErrorResponse;

type GoogleLoginReply = LoginSuccess | ApiErrorResponse;

type JwtBasePayload = {
  sub: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type RateLimiter = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

type AuthDeps = {
  accessCookieName: string;
  refreshCookieName: string;
  oauthSentinel: string;
  registerRateLimiter: RateLimiter;
  loginRateLimiter: RateLimiter;
  refreshRateLimiter: RateLimiter;
  issueTokens: (reply: FastifyReply, payload: JwtBasePayload) => void;
  clearSessionCookies: (reply: FastifyReply) => void;
  decodeToken: (token: string, expectedType: 'access' | 'refresh') => JwtBasePayload;
  touchOnline?: (userId: number) => void;
  markOffline?: (userId: number) => void;
};

const responseErrorSchema = () => ({
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' }
  },
  required: ['error', 'message']
});

const responseUserSchema = () => ({
  type: 'object',
  properties: {
    id: { type: 'number' },
    email: { type: 'string' },
    nickname: { type: 'string' },
    provider: { type: 'string' }
  },
  required: ['id', 'email', 'nickname', 'provider']
});

const manualRegisterSchema = {
  body: {
    type: 'object',
    required: ['email', 'nickname', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 256 },
      nickname: { type: 'string', minLength: 3, maxLength: 48 },
      password: { type: 'string', minLength: 8, maxLength: 128 }
    }
  },
  response: {
    200: responseErrorSchema(),
    201: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        email: { type: 'string' },
        nickname: { type: 'string' }
      },
      required: ['id', 'email', 'nickname']
    },
    500: responseErrorSchema()
  }
} as const;

const googleRegisterSchema = {
  body: {
    type: 'object',
    required: ['email', 'nickname', 'googleId'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 256 },
      nickname: { type: 'string', minLength: 3, maxLength: 48 },
      googleId: { type: 'string', minLength: 1, maxLength: 256 }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        email: { type: 'string' },
        nickname: { type: 'string' },
        provider: { type: 'string', const: 'google' }
      },
      required: ['id', 'email', 'nickname', 'provider']
    },
    409: responseErrorSchema(),
    500: responseErrorSchema()
  }
} as const;

const manualLoginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 256 },
      password: { type: 'string', minLength: 8, maxLength: 128 }
    }
  },
  response: {
    200: { oneOf: [responseUserSchema(), responseErrorSchema()] },
    500: responseErrorSchema()
  }
} as const;

const googleLoginSchema = {
  body: {
    type: 'object',
    required: ['googleId'],
    additionalProperties: false,
    properties: {
      googleId: { type: 'string', minLength: 1, maxLength: 256 }
    }
  },
  response: {
    200: responseUserSchema(),
    404: responseErrorSchema(),
    500: responseErrorSchema()
  }
} as const;

const refreshSchema = {
  response: {
    200: responseUserSchema(),
    401: responseErrorSchema()
  }
} as const;

export const registerAuthRoutes = (app: FastifyInstance, deps: AuthDeps) => {
  app.post<{ Body: ManualRegisterBody; Reply: ManualRegisterReply }>(
    '/api/users/register',
    { schema: manualRegisterSchema, preHandler: [deps.registerRateLimiter] },
    async (request, reply) => {
      const { email, nickname, password } = request.body;
      const passwordHash = await bcrypt.hash(password, 10);

      try {
        const result = await request.server.db.run(
          `
            INSERT INTO users (email, password_hash, nickname, provider)
            VALUES (?, ?, ?, 'local')
          `,
          email,
          passwordHash,
          nickname
        );

        return reply.status(201).send({
          id: result.lastID ?? 0,
          email,
          nickname
        });
      } catch (error) {
        const sqliteError = error as { code?: string };
        if (sqliteError?.code === 'SQLITE_CONSTRAINT') {
          return reply.status(200).send({
            error: 'UserAlreadyExists',
            message: 'Bu e-posta veya kullanıcı adı ile kayıt mevcut.'
          });
        }

        request.log.error({ err: error }, 'Kullanıcı kaydı başarısız oldu');

        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Kullanıcı oluşturulurken bilinmeyen bir hata oluştu.'
        });
      }
    }
  );

  app.post<{ Body: GoogleRegisterBody; Reply: GoogleRegisterReply }>(
    '/api/users/register/google',
    { schema: googleRegisterSchema, preHandler: [deps.registerRateLimiter] },
    async (request, reply) => {
      const { email, nickname, googleId } = request.body;

      try {
        const result = await request.server.db.run(
          `
            INSERT INTO users (email, password_hash, nickname, provider, provider_id)
            VALUES (?, ?, ?, 'google', ?)
          `,
          email,
          deps.oauthSentinel,
          nickname,
          googleId
        );

        return reply.status(201).send({
          id: result.lastID ?? 0,
          email,
          nickname,
          provider: 'google'
        });
      } catch (error) {
        const sqliteError = error as { code?: string };
        if (sqliteError?.code === 'SQLITE_CONSTRAINT') {
          return reply.status(409).send({
            error: 'UserAlreadyExists',
            message: 'Bu Google hesabı veya e-posta ile kayıt mevcut.'
          });
        }

        request.log.error({ err: error }, 'Google kayıt işlemi başarısız oldu');

        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Google kaydı sırasında bilinmeyen bir hata oluştu.'
        });
      }
    }
  );

  app.post<{ Body: ManualLoginBody; Reply: ManualLoginReply }>(
    '/api/users/login',
    { schema: manualLoginSchema, preHandler: [deps.loginRateLimiter] },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await request.server.db.get<{
        id: number;
        email: string;
        password_hash: string;
        nickname: string;
        provider: string;
      }>(`SELECT * FROM users WHERE email = ? AND provider = 'local'`, email);

      if (!user) {
        return reply.status(200).send({
          error: 'InvalidCredentials',
          message: 'E-posta veya şifre hatalı.'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return reply.status(200).send({
          error: 'InvalidCredentials',
          message: 'E-posta veya şifre hatalı.'
        });
      }

      const payload: JwtBasePayload = {
        sub: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: 'local'
      };

      deps.issueTokens(reply, payload);
      deps.touchOnline?.(payload.sub);

      return reply.status(200).send({
        id: payload.sub,
        email: payload.email,
        nickname: payload.nickname,
        provider: payload.provider
      });
    }
  );

  app.post<{ Body: GoogleLoginBody; Reply: GoogleLoginReply }>(
    '/api/users/login/google',
    { schema: googleLoginSchema, preHandler: [deps.loginRateLimiter] },
    async (request, reply) => {
      const { googleId } = request.body;

      const user = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
      }>(
        `SELECT id, email, nickname, provider FROM users WHERE provider = 'google' AND provider_id = ?`,
        googleId
      );

      if (!user) {
        return reply.status(404).send({
          error: 'UserNotFound',
          message: 'Google hesabı ile eşleşen kullanıcı kaydı bulunamadı.'
        });
      }

      const payload: JwtBasePayload = {
        sub: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: 'google'
      };

      deps.issueTokens(reply, payload);
      deps.touchOnline?.(payload.sub);

      return reply.status(200).send({
        id: payload.sub,
        email: payload.email,
        nickname: payload.nickname,
        provider: payload.provider
      });
    }
  );

  app.post<{ Reply: LoginSuccess | ApiErrorResponse }>(
    '/api/users/refresh',
    { schema: refreshSchema, preHandler: [deps.refreshRateLimiter] },
    async (request, reply) => {
      const unauthorized = () => {
        deps.clearSessionCookies(reply);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Oturum süresi doldu. Lütfen yeniden giriş yap.'
        });
      };

      const cookies = cookie.parse(request.headers.cookie ?? '');
      const token = cookies[deps.refreshCookieName];

      if (!token) {
        return unauthorized();
      }

      let session: JwtBasePayload;
      try {
        session = deps.decodeToken(token, 'refresh');
      } catch {
        return unauthorized();
      }

      const user = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
      }>(
        `SELECT id, email, nickname, provider FROM users WHERE id = ?`,
        session.sub
      );

      if (!user) {
        return unauthorized();
      }

      const payload: JwtBasePayload = {
        sub: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: user.provider === 'google' ? 'google' : 'local'
      };

      deps.issueTokens(reply, payload);
      deps.touchOnline?.(payload.sub);

      return reply.status(200).send({
        id: payload.sub,
        email: payload.email,
        nickname: payload.nickname,
        provider: payload.provider
      });
    }
  );

  app.post(
    '/api/users/logout',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.session) {
        deps.markOffline?.(request.session.sub);
      }
      deps.clearSessionCookies(reply);
      reply.status(204).send();
    }
  );

  app.get<{ Reply: SessionStatusResponse }>(
    '/api/users/session',
    async (request, reply) => {
      const unauthenticated = () => {
        deps.clearSessionCookies(reply);
        return reply.status(200).send({ authenticated: false });
      };

      const cookies = cookie.parse(request.headers.cookie ?? '');
      const accessToken = cookies[deps.accessCookieName];
      const refreshToken = cookies[deps.refreshCookieName];

      if (accessToken) {
        try {
          const payload = deps.decodeToken(accessToken, 'access');
          deps.touchOnline?.(payload.sub);
          return reply.status(200).send({
            authenticated: true,
            user: {
              id: payload.sub,
              email: payload.email,
              nickname: payload.nickname,
              provider: payload.provider
            }
          });
        } catch {
        }
      }

      if (!refreshToken) {
        return unauthenticated();
      }

      let session: JwtBasePayload;
      try {
        session = deps.decodeToken(refreshToken, 'refresh');
      } catch {
        return unauthenticated();
      }

      const user = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
      }>(
        `SELECT id, email, nickname, provider FROM users WHERE id = ?`,
        session.sub
      );

      if (!user) {
        return unauthenticated();
      }

      const payload: JwtBasePayload = {
        sub: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: user.provider === 'google' ? 'google' : 'local'
      };

      deps.issueTokens(reply, payload);
      deps.touchOnline?.(payload.sub);

      return reply.status(200).send({
        authenticated: true,
        user: {
          id: payload.sub,
          email: payload.email,
          nickname: payload.nickname,
          provider: payload.provider
        }
      });
    }
  );
};
