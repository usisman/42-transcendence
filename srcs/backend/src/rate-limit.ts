import type { FastifyReply, FastifyRequest } from 'fastify';

type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  keyGenerator?: (request: FastifyRequest) => string;
  errorMessage?: string;
};

type HitBucket = {
  count: number;
  expiresAt: number;
};


export const createRateLimiter = (options: RateLimiterOptions) => {
  const hits = new Map<string, HitBucket>();
  const { limit, windowMs, keyGenerator, errorMessage } = options;

  const getKey = (request: FastifyRequest) => {
    if (keyGenerator) {
      return keyGenerator(request);
    }
    const ip = request.ip ?? request.headers['x-forwarded-for'] ?? 'unknown';
    const route = request.routeOptions?.url ?? request.raw.url ?? '';
    return `${ip}:${route}`;
  };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = getKey(request);
    const now = Date.now();
    const bucket = hits.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + windowMs });
      return;
    }

    if (bucket.count >= limit) {
      await reply.status(429).send({
        error: 'TooManyRequests',
        message: errorMessage ?? 'Çok fazla deneme yaptın, lütfen biraz bekle.'
      });
      return reply;
    }

    bucket.count += 1;
  };
};
