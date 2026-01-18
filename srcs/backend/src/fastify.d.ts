import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDatabase } from './database.js';

type JwtSession = {
  sub: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    session?: JwtSession;
  }
}
