import { config } from 'dotenv';
import { resolve } from 'path';

const envFile = resolve(process.cwd(), '.env');
config({ path: envFile, override: false });

const read = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const toNumber = (value: string, key: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number.`);
  }
  return parsed;
};

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  port: toNumber(process.env.PORT ?? '3000', 'PORT'),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: read('JWT_SECRET'),
  cookieSecure: process.env.COOKIE_SECURE === 'true' || nodeEnv === 'production',
  googleClientId: read('GOOGLE_CLIENT_ID'),
  googleClientSecret: read('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: read('GOOGLE_REDIRECT_URI')
};
