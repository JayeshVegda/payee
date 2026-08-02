import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { databaseHealth, type DatabaseRuntime } from '@payment-ledger/database';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createApi } from './api.js';

export interface AppOptions {
  runtime: DatabaseRuntime;
  expectedHost: string;
  webBuildDirectory?: string;
  logLevel?: string;
}

interface ErrorBody {
  error: { code: string; message: string };
}

function log(level: string, message: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...fields })}\n`
  );
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const defaultWebBuildDirectory = existsSync(resolve('apps/web-react/build'))
    ? 'apps/web-react/build'
    : 'apps/web/build';
  const webBuildDirectory = resolve(options.webBuildDirectory ?? defaultWebBuildDirectory);
  const logLevel = options.logLevel ?? 'info';

  app.use('*', secureHeaders());
  app.use('*', async (context, next) => {
    const host = context.req.header('host');
    if (host !== options.expectedHost) {
      return context.json<ErrorBody>(
        { error: { code: 'INVALID_HOST', message: 'Request host is not allowed' } },
        403
      );
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      const origin = context.req.header('origin');
      if (origin && origin !== `http://${options.expectedHost}`) {
        return context.json<ErrorBody>(
          { error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed' } },
          403
        );
      }
    }
    const startedAt = performance.now();
    await next();
    if (logLevel !== 'silent') {
      log('info', 'request', {
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        status: context.res.status,
        durationMs: Number((performance.now() - startedAt).toFixed(1))
      });
    }
  });

  app.get('/api/health', async (context) => {
    const database = await databaseHealth(options.runtime.db);
    return context.json({ status: 'ok' as const, version: '0.1.0', database });
  });
  app.route('/api', createApi(options.runtime));

  if (existsSync(webBuildDirectory)) {
    app.use('*', serveStatic({ root: webBuildDirectory }));
  }

  app.notFound(async (context) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname.startsWith('/api/')) {
      return context.json<ErrorBody>(
        { error: { code: 'NOT_FOUND', message: 'API route not found' } },
        404
      );
    }
    if (context.req.method === 'GET' && existsSync(resolve(webBuildDirectory, 'index.html'))) {
      return context.html(readFileSync(resolve(webBuildDirectory, 'index.html'), 'utf8'));
    }
    return context.text('Not found', 404);
  });

  app.onError((error, context) => {
    log('error', 'request_failed', {
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    const expected =
      error instanceof TypeError ||
      error instanceof RangeError ||
      ['ClosedBusinessDateError', 'TransactionConflictError', 'TransactionNotFoundError'].includes(
        error.name
      );
    return context.json<ErrorBody>(
      {
        error: {
          code: expected ? error.name.replace(/Error$/, '').toUpperCase() : 'INTERNAL_ERROR',
          message: expected ? error.message : 'The request could not be completed'
        }
      },
      expected
        ? error.name.includes('Conflict') || error.name.includes('Closed')
          ? 409
          : 400
        : 500
    );
  });

  return app;
}
