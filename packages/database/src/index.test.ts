import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TransactionService, TransactionConflictError } from '@payment-ledger/core';
import {
  businessNow,
  LedgerService,
  migrateDatabase,
  openDatabase,
  SqliteTransactionRepository
} from './index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'payment-ledger-test-'));
  temporaryDirectories.push(directory);
  const runtime = openDatabase({ databasePath: join(directory, 'ledger.sqlite3') });
  const categoryId = Number(
    runtime.sqlite.prepare("SELECT id FROM categories WHERE name = 'Tools'").pluck().get()
  );
  const methodId = Number(
    runtime.sqlite.prepare("SELECT id FROM payment_methods WHERE code = 'cash'").pluck().get()
  );
  const payeeId = Number(
    runtime.sqlite
      .prepare(
        "INSERT INTO payees (type, name, normalized_name) VALUES ('person', 'Ramesh', 'ramesh')"
      )
      .run().lastInsertRowid
  );
  return { runtime, categoryId, methodId, payeeId };
}

describe('database foundation', () => {
  it('enables reliability pragmas and applies migrations idempotently', async () => {
    const { runtime } = createFixture();
    expect(runtime.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(runtime.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(runtime.sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(migrateDatabase(runtime.sqlite)).toEqual([]);
    expect(runtime.sqlite.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(6);
    await runtime.close();
  });

  it('creates, corrects and voids with append-only audit records', async () => {
    const { runtime, categoryId, methodId, payeeId } = createFixture();
    const service = new TransactionService(new SqliteTransactionRepository(runtime.db));
    const created = await service.create({
      transactionDate: '2026-08-01',
      transactionTime: '09:30:00',
      payeeId,
      amountPaise: 80_000,
      categoryId,
      paymentMethodId: methodId,
      note: 'Furnace work',
      source: 'web',
      needsReview: false
    });
    const corrected = await service.correct(created.id, {
      amountPaise: 85_000,
      expectedUpdatedAt: created.updatedAt,
      source: 'web'
    });
    expect(corrected.version).toBe(2);
    await expect(
      service.correct(created.id, {
        amountPaise: 90_000,
        expectedUpdatedAt: created.updatedAt,
        source: 'web'
      })
    ).rejects.toBeInstanceOf(TransactionConflictError);
    const voided = await service.void(created.id, 'Duplicate entry', 'web');
    expect(voided.status).toBe('voided');
    expect(runtime.sqlite.prepare('SELECT count(*) FROM transaction_audit').pluck().get()).toBe(3);
    expect(() =>
      runtime.sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(created.id)
    ).toThrow(/cannot be deleted/);
    await runtime.close();
  });

  it('rejects a changed migration checksum', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'payment-ledger-migration-test-'));
    temporaryDirectories.push(directory);
    const migrations = join(directory, 'migrations');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(migrations);
    writeFileSync(
      join(migrations, '001_test.sql'),
      'CREATE TABLE test (id INTEGER PRIMARY KEY) STRICT;'
    );
    const runtime = openDatabase({
      databasePath: join(directory, 'ledger.sqlite3'),
      migrate: false
    });
    migrateDatabase(runtime.sqlite, migrations);
    const original = readFileSync(join(migrations, '001_test.sql'), 'utf8');
    writeFileSync(join(migrations, '001_test.sql'), `${original}\n-- changed`);
    expect(() => migrateDatabase(runtime.sqlite, migrations)).toThrow(/checksum changed/);
    await runtime.close();
  });

  it('supports master data, quick capture and reports', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'payment-ledger-product-test-'));
    temporaryDirectories.push(directory);
    const runtime = openDatabase({ databasePath: join(directory, 'ledger.sqlite3') });
    const ledger = new LedgerService(runtime);
    const master = ledger.getMasterData();
    const cash = master.paymentMethods.find((method) => method.code === 'cash');
    const tools = master.categories.find((category) => category.name === 'Tools');
    const payee = ledger.createPayee({
      type: 'company',
      name: 'ABC Tools',
      aliases: ['abc'],
      defaultCategoryId: tools?.id ?? null,
      defaultPaymentMethodId: cash?.id ?? null,
      favourite: true
    });
    const preview = ledger.previewQuickEntry('abc 12.5k drill bits');
    expect(preview).toMatchObject({ valid: true, payeeId: payee.id, amountPaise: 1_250_000 });
    expect(ledger.previewQuickEntry('abc 800 3-jan')).toMatchObject({
      transactionDate: '2026-01-03',
      paymentMethodName: 'Cash',
      note: null
    });
    expect(ledger.previewQuickEntry('abc 800 bank 3-jan')).toMatchObject({
      paymentMethodName: 'Bank transfer'
    });
    expect(ledger.previewQuickEntry('abc 800 3-1-2026')).toMatchObject({
      transactionDate: '2026-01-03',
      note: null
    });
    expect(ledger.previewQuickEntry('abc 800 25/06/2026')).toMatchObject({
      transactionDate: '2026-06-25',
      note: null
    });
    const saved = await ledger.createFromCommand('abc 12.5k drill bits');
    expect(saved.transaction.amountPaise).toBe(1_250_000);
    const clock = businessNow();
    const reports = ledger.getReports(clock.date, clock.date);
    expect((reports.totals as { paymentCount: number }).paymentCount).toBe(1);
    expect(
      (reports.categories[0] as { averageTransactionPaise: number }).averageTransactionPaise
    ).toBe(1_250_000);
    await runtime.close();
  });
});
