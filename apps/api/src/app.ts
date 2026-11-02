import express, { type ErrorRequestHandler } from 'express';
import { healthResponseSchema } from '@monivo/shared';
import mongoose from 'mongoose';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { createApiRouter, type ApiOptions } from './modules/routes.js';
import { ApiError } from './modules/errors.js';

export function createApp(
  isDatabaseConnected: () => boolean,
  options?: ApiOptions,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
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
  app.use(
    '/api',
    createApiRouter(options ?? { connection: mongoose.connection }),
  );
  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({
        error: 'Please check the submitted details.',
        fields: [...new Set(error.issues.map((issue) => issue.path.join('.')))],
      });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      response
        .status(409)
        .json({ error: 'This record already exists. Please try again.' });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 413
    ) {
      response.status(413).json({ error: 'Request too large.' });
      return;
    }
    const badRequest =
      error instanceof SyntaxError && 'status' in error && error.status === 400;
    response
      .status(badRequest ? 400 : 500)
      .json({ error: badRequest ? 'Invalid JSON' : 'Internal server error' });
  };
  app.use(errorHandler);
  return app;
}
