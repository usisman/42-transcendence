import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'url';
import { createDatabaseConnection } from './database.js';
import type { AppDatabase } from './database.js';
import { env } from './env.js';
import { createRateLimiter } from './rate-limit.js';
import { registerMetrics, tournamentCreatedCounter, tournamentJoinedCounter, tournamentStartedCounter } from './metrics.js';
import { registerOAuthRoutes } from './routes/oauth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerTournamentRoutes } from './routes/tournaments.js';
import { registerFriendRoutes } from './routes/friends.js';
import { registerGameSessionRoutes } from './routes/game-sessions.js';
import { createOnlineTracker } from './online-status.js';
import { registerGameWebSocket } from './game-ws.js';
import multipart from '@fastify/multipart';
import path from 'path';
import { promises as fs } from 'fs';

const ACCESS_COOKIE_NAME = 'session';
const REFRESH_COOKIE_NAME = 'refresh_session';
const OAUTH_SENTINEL = 'GOOGLE_OAUTH_ACCOUNT';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; 
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const GOOGLE_STATE_COOKIE = 'google_oauth_state';
const GOOGLE_STATE_TTL_SECONDS = 5 * 60;
const FRONTEND_AUTH_PATH = '/#/auth';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];


function responseErrorSchema() {
  return {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' }
    },
    required: ['error', 'message']
  };
}

function responseUserSchema() {
  return {
    type: 'object',
    properties: {
      id: { type: 'number' },
      email: { type: 'string' },
      nickname: { type: 'string' },
      provider: { type: 'string' }
    },
    required: ['id', 'email', 'nickname', 'provider']
  };
}

type ApiErrorResponse = {
  error: string;
  message: string;
};

type JwtBasePayload = {
  sub: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type JwtPayload = JwtBasePayload & {
  tokenType: 'access' | 'refresh';
};

type LoginSuccess = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type MeResponse = LoginSuccess;
const createAccessToken = (payload: JwtBasePayload) =>
  jwt.sign({ ...payload, tokenType: 'access' }, env.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });

const createRefreshToken = (payload: JwtBasePayload) =>
  jwt.sign({ ...payload, tokenType: 'refresh' }, env.jwtSecret, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS
  });

const serializeCookie = (name: string, value: string, maxAge: number) =>
  cookie.serialize(name, value, {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure: env.cookieSecure
  });

const appendCookies = (reply: FastifyReply, cookiesToAdd: string[]) => {
  const existing = reply.getHeader('Set-Cookie');
  if (!existing) {
    reply.header('Set-Cookie', cookiesToAdd);
    return;
  }

  if (Array.isArray(existing)) {
    reply.header('Set-Cookie', [...existing, ...cookiesToAdd]);
    return;
  }

  reply.header('Set-Cookie', [existing as string, ...cookiesToAdd]);
};

const issueTokens = (reply: FastifyReply, payload: JwtBasePayload) => {
  const accessToken = createAccessToken(payload);
  const refreshToken = createRefreshToken(payload);

  appendCookies(reply, [
    serializeCookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_TOKEN_TTL_SECONDS),
    serializeCookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_TOKEN_TTL_SECONDS)
  ]);
};

const clearSessionCookies = (reply: FastifyReply) => {
  appendCookies(reply, [
    serializeCookie(ACCESS_COOKIE_NAME, '', 0),
    serializeCookie(REFRESH_COOKIE_NAME, '', 0)
  ]);
};

const clearOauthStateCookie = (reply: FastifyReply) => {
  appendCookies(reply, [serializeCookie(GOOGLE_STATE_COOKIE, '', 0)]);
};

const decodeToken = (token: string, expectedType: JwtPayload['tokenType']): JwtBasePayload => {
  const payload = jwt.verify(token, env.jwtSecret);

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid token payload');
  }

  const record = payload as Record<string, unknown>;
  const tokenType = record.tokenType;
  const subRaw = record.sub;
  const email = record.email;
  const nickname = record.nickname;
  const provider = record.provider;

  if (tokenType !== expectedType) {
    throw new Error('Invalid token type');
  }

  const sub =
    typeof subRaw === 'number'
      ? subRaw
      : typeof subRaw === 'string'
        ? Number(subRaw)
        : NaN;

  if (
    Number.isNaN(sub) ||
    typeof email !== 'string' ||
    typeof nickname !== 'string' ||
    (provider !== 'local' && provider !== 'google')
  ) {
    throw new Error('Invalid token claims');
  }

  return {
    sub,
    email,
    nickname,
    provider
  };
};

const normalizeNickname = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 32);

const ensureUniqueNickname = async (db: AppDatabase, desired: string) => {
  const base = normalizeNickname(desired) || 'player';
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await db.get(`SELECT 1 FROM users WHERE nickname = ?`, candidate);
    if (!existing) {
      return candidate;
    }

    const suffix = `-${counter++}`;
    const maxBaseLength = Math.max(1, 48 - suffix.length);
    candidate = `${base.slice(0, maxBaseLength)}${suffix}`;
  }
};

const buildGoogleAuthUrl = (state: string) => {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'online',
    prompt: 'select_account',
    state
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

const buildFrontendRedirect = (status?: string) =>
  status ? `${FRONTEND_AUTH_PATH}?oauth=${status}` : FRONTEND_AUTH_PATH;

function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    return payload;
  });
}

function registerAuthenticationHelpers(app: FastifyInstance, touchOnline?: (userId: number) => void) {
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const unauthorizedResponse = () => {
        request.session = undefined;
        clearSessionCookies(reply);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      };

      const cookies = cookie.parse(request.headers.cookie ?? '');
      const token = cookies[ACCESS_COOKIE_NAME];

      if (!token) {
        return unauthorizedResponse();
      }

      try {
        request.session = decodeToken(token, 'access');
        if (request.session) {
          touchOnline?.(request.session.sub);
        }
      } catch {
        return unauthorizedResponse();
      }
    }
  );
}

export const buildServer = () => {
  const app = Fastify({ 
    logger: true,
    bodyLimit: 5 * 1024 * 1024 // 5MB body limit (avatar upload için)
  });
  registerMetrics(app);

  const onlineTracker = createOnlineTracker({ ttlMs: 2 * 60 * 1000 });

  const registerRateLimiter = createRateLimiter({
    limit: 8,
    windowMs: 10 * 60 * 1000,
    errorMessage: 'Çok fazla kayıt denemesi yaptın. Lütfen bir süre sonra tekrar dene.'
  });
  const loginRateLimiter = createRateLimiter({
    limit: 5,
    windowMs: 60 * 1000,
    errorMessage: 'Çok fazla giriş denemesi yaptın. Lütfen 1 dakika sonra tekrar dene.'
  });
  const refreshRateLimiter = createRateLimiter({
    limit: 10,
    windowMs: 60 * 1000,
    errorMessage: 'Çok fazla yenileme isteği gönderildi. Lütfen birkaç saniye sonra tekrar dene.'
  });

  void app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024
    }
  });

  const uploadsDir = path.join(process.cwd(), 'data', 'uploads', 'avatars');
  void fs.mkdir(uploadsDir, { recursive: true }).catch(() => {
  });

  (app as any).uploadsDir = uploadsDir;

  registerSecurityHeaders(app);
  registerAuthenticationHelpers(app, onlineTracker.touch);

  app.get('/health', async () => ({ status: 'ok' }));
  registerOAuthRoutes(app, {
    googleClientId: env.googleClientId,
    googleClientSecret: env.googleClientSecret,
    googleRedirectUri: env.googleRedirectUri,
    oauthSentinel: OAUTH_SENTINEL,
    googleStateCookie: GOOGLE_STATE_COOKIE,
    googleStateTtlSeconds: GOOGLE_STATE_TTL_SECONDS,
    buildGoogleAuthUrl,
    buildFrontendRedirect,
    appendCookies,
    serializeCookie,
    clearOauthStateCookie,
    issueTokens,
    ensureUniqueNickname
  });
  registerAuthRoutes(app, {
    accessCookieName: ACCESS_COOKIE_NAME,
    refreshCookieName: REFRESH_COOKIE_NAME,
    oauthSentinel: OAUTH_SENTINEL,
    registerRateLimiter,
    loginRateLimiter,
    refreshRateLimiter,
    issueTokens,
    clearSessionCookies,
    decodeToken,
    touchOnline: onlineTracker.touch,
    markOffline: onlineTracker.remove
  });
  registerProfileRoutes(app, {
    uploadsDir
  });
  registerTournamentRoutes(app, {
    tournamentCreatedCounter,
    tournamentJoinedCounter,
    tournamentStartedCounter
  });
  registerFriendRoutes(app, { isOnline: onlineTracker.isOnline });
  registerGameSessionRoutes(app);
  return app;
};
const start = async () => {
  const server = buildServer();
  const db = await createDatabaseConnection();

  server.decorate('db', db);
  
  registerGameWebSocket(server);
  server.addHook('onClose', async () => {
    await db.close();
  });

  try {
    await server.listen({ port: env.port, host: env.host });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  void start();
}

export type AppServer = ReturnType<typeof buildServer>;
