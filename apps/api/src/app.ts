import express, { type ErrorRequestHandler } from 'express';
import { healthResponseSchema } from '@monivo/shared';

export function createApp(isDatabaseConnected: () => boolean) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health/live', (_request, response) => {
    response.json({ status: 'ok', service: 'monivo-api' });
  });

  const readiness: express.RequestHandler = (_request, response) => {
    const connected = isDatabaseConnected();
    response.status(connected ? 200 : 503).json(
      healthResponseSchema.parse({
        status: connected ? 'ok' : 'unavailable',
        service: 'monivo-api',
        database: connected ? 'connected' : 'disconnected',
      }),
    );
  };
  app.get('/health', readiness);
  app.get('/health/ready', readiness);
  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    const badRequest =
      error instanceof SyntaxError && 'status' in error && error.status === 400;
    response
      .status(badRequest ? 400 : 500)
      .json({ error: badRequest ? 'Invalid JSON' : 'Internal server error' });
  };
  app.use(errorHandler);
  return app;
}
