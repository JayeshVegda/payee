import { LedgerService, businessNow, type DatabaseRuntime } from '@payment-ledger/database';
import { Hono } from 'hono';

function integer(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function id(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError('Invalid identifier');
  return parsed;
}

function yes(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function createApi(runtime: DatabaseRuntime): Hono {
  const api = new Hono();
  const ledger = new LedgerService(runtime);

  api.get('/clock', (context) => context.json(businessNow()));
  api.get('/activity', (context) => context.json(ledger.getActivity(integer(context.req.query('limit')))));
  api.get('/system/status', (context) => context.json(ledger.getSystemStatus()));
  api.get('/dashboard', (context) => context.json(ledger.getDashboard(context.req.query('date'))));

  api.get('/master-data', (context) =>
    context.json(
      ledger.getMasterData({ includeInactive: yes(context.req.query('includeInactive')) })
    )
  );
  api.post('/payees', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.createPayee>[0]>();
    return context.json(ledger.createPayee(body), 201);
  });
  api.patch('/payees/:id', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.updatePayee>[1]>();
    return context.json(ledger.updatePayee(id(context.req.param('id')), body));
  });
  api.post('/categories', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.createCategory>[0]>();
    return context.json(ledger.createCategory(body), 201);
  });
  api.patch('/categories/:id', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.updateCategory>[1]>();
    return context.json(ledger.updateCategory(id(context.req.param('id')), body));
  });
  api.patch('/payment-methods/:id', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.updatePaymentMethod>[1]>();
    return context.json(ledger.updatePaymentMethod(id(context.req.param('id')), body));
  });

  api.post('/quick-entry/preview', async (context) => {
    const body = await context.req.json<{ command: string }>();
    return context.json(ledger.previewQuickEntry(body.command));
  });
  api.post('/quick-entry/save', async (context) => {
    const body = await context.req.json<{ command: string }>();
    return context.json(await ledger.createFromCommand(body.command), 201);
  });

  api.get('/transactions', (context) =>
    context.json(
      ledger.listTransactions({
        ...(context.req.query('date') ? { date: context.req.query('date') } : {}),
        ...(context.req.query('from') ? { from: context.req.query('from') } : {}),
        ...(context.req.query('to') ? { to: context.req.query('to') } : {}),
        ...(context.req.query('search') ? { search: context.req.query('search') } : {}),
        ...(integer(context.req.query('methodId'))
          ? { methodId: integer(context.req.query('methodId')) }
          : {}),
        ...(integer(context.req.query('categoryId'))
          ? { categoryId: integer(context.req.query('categoryId')) }
          : {}),
        ...(integer(context.req.query('payeeId'))
          ? { payeeId: integer(context.req.query('payeeId')) }
          : {}),
        reviewOnly: yes(context.req.query('reviewOnly')),
        includeVoided: yes(context.req.query('includeVoided')),
        ...(integer(context.req.query('page')) ? { page: integer(context.req.query('page')) } : {}),
        ...(integer(context.req.query('pageSize'))
          ? { pageSize: integer(context.req.query('pageSize')) }
          : {})
      })
    )
  );
  api.post('/transactions', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.createTransaction>[0]>();
    return context.json(await ledger.createTransaction(body), 201);
  });
  api.post('/transactions/batch', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.createBatchTransactions>[0]>();
    return context.json(ledger.createBatchTransactions(body), 201);
  });
  api.get('/transactions/:id', (context) =>
    context.json(ledger.getTransaction(id(context.req.param('id'))))
  );
  api.patch('/transactions/:id', async (context) => {
    const body = await context.req.json<Parameters<typeof ledger.correctTransaction>[1]>();
    return context.json(await ledger.correctTransaction(id(context.req.param('id')), body));
  });
  api.post('/transactions/:id/void', async (context) => {
    const body = await context.req.json<{ reason: string }>();
    return context.json(await ledger.voidTransaction(id(context.req.param('id')), body.reason));
  });
  api.get('/transactions/:id/audit', (context) =>
    context.json(ledger.getTransactionAudit(id(context.req.param('id'))))
  );

  api.get('/reports', (context) => {
    const clock = businessNow();
    return context.json(
      ledger.getReports(
        context.req.query('from') ?? `${clock.date.slice(0, 8)}01`,
        context.req.query('to') ?? clock.date
      )
    );
  });
  api.get('/export/transactions.csv', (context) => {
    const csv = ledger.exportTransactionsCsv({
      ...(context.req.query('from') ? { from: context.req.query('from') } : {}),
      ...(context.req.query('to') ? { to: context.req.query('to') } : {}),
      includeVoided: yes(context.req.query('includeVoided'))
    });
    context.header('Content-Type', 'text/csv; charset=utf-8');
    context.header('Content-Disposition', 'attachment; filename="payment-ledger.csv"');
    return context.body(`\uFEFF${csv}`);
  });
  api.post('/system/backup', async (context) => context.json(await ledger.createBackup(), 201));

  return api;
}
