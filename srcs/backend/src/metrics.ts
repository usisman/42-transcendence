import type { FastifyInstance, FastifyRequest } from 'fastify';
import client, { type Registry } from 'prom-client';

const metricsRegistry: Registry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request sureleri',
  labelNames: ['method', 'route', 'statusCode'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

const tournamentCreatedCounter = new client.Counter({
  name: 'tournament_created_total',
  help: 'Olusturulan turnuva sayisi',
  labelNames: ['ownerProvider']
});

const tournamentJoinedCounter = new client.Counter({
  name: 'tournament_join_total',
  help: 'Turnuvaya katilim sayisi',
  labelNames: ['provider']
});

const tournamentStartedCounter = new client.Counter({
  name: 'tournament_started_total',
  help: 'Baslatilan turnuva sayisi'
});

metricsRegistry.registerMetric(httpRequestDuration);
metricsRegistry.registerMetric(tournamentCreatedCounter);
metricsRegistry.registerMetric(tournamentJoinedCounter);
metricsRegistry.registerMetric(tournamentStartedCounter);

export const registerMetrics = (app: FastifyInstance) => {
  const METRICS_START = Symbol('metrics-start');

  app.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { [METRICS_START]?: bigint })[METRICS_START] =
      process.hrtime.bigint();
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const start = (request as FastifyRequest & { [METRICS_START]?: bigint })[
      METRICS_START
    ];
    if (start) {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route =
        (request.routerPath as string | undefined) ??
        request.routeOptions?.url ??
        request.url ??
        'unknown';
      httpRequestDuration
        .labels(request.method, route, String(reply.statusCode))
        .observe(duration);
    }
    done();
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};

export {
  metricsRegistry,
  httpRequestDuration,
  tournamentCreatedCounter,
  tournamentJoinedCounter,
  tournamentStartedCounter
};
