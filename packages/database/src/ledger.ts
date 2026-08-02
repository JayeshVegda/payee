import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import {
  TransactionNotFoundError,
  TransactionService,
  type TransactionRecord
} from '@payment-ledger/core';
import {
  normalizeLookupText,
  parseQuickEntry,
  type QuickEntryPreview
} from '@payment-ledger/parser';
import {
  createTransactionSchema,
  type ChangeSource,
  type CorrectTransactionInput
} from '@payment-ledger/shared';
import type Database from 'better-sqlite3';
import {
  SqliteTransactionRepository,
  verifyDatabaseIntegrity,
  type DatabaseRuntime
} from './index.js';

interface PayeeRow {
  id: number;
  type: 'person' | 'company';
  name: string;
  normalized_name: string;
  default_category_id: number | null;
  default_payment_method_id: number | null;
  active: number;
  favourite: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  aliases: string | null;
  payment_count?: number;
  total_paid_paise?: number;
}

interface CategoryRow {
  id: number;
  name: string;
  parent_id: number | null;
  active: number;
  sort_order: number;
  aliases: string | null;
}

interface PaymentMethodRow {
  id: number;
  code: string;
  display_name: string;
  active: number;
}

interface TransactionListRow {
  id: number;
  transaction_date: string;
  transaction_time: string;
  payee_id: number;
  payee_name: string;
  amount_paise: number;
  category_id: number | null;
  category_name: string | null;
  payment_method_id: number | null;
  payment_method_name: string | null;
  payment_method_code: string | null;
  note: string | null;
  source: ChangeSource;
  status: 'posted' | 'voided';
  needs_review: number;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ListTransactionOptions {
  date?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  methodId?: number | undefined;
  categoryId?: number | undefined;
  payeeId?: number | undefined;
  reviewOnly?: boolean | undefined;
  includeVoided?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CreatePayeeInput {
  type: 'person' | 'company';
  name: string;
  aliases?: string[];
  defaultCategoryId?: number | null;
  defaultPaymentMethodId?: number | null;
  favourite?: boolean;
  notes?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function businessNow(date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}:${value('second')}`
  };
}

function requiredName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 160) {
    throw new TypeError('Name must contain 2 to 160 characters');
  }
  return value.trim();
}

function mapPayee(row: PayeeRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    defaultCategoryId: row.default_category_id,
    defaultPaymentMethodId: row.default_payment_method_id,
    active: row.active === 1,
    favourite: row.favourite === 1,
    notes: row.notes,
    aliases: row.aliases ? row.aliases.split('|||').filter(Boolean) : [],
    paymentCount: row.payment_count ?? 0,
    totalPaidPaise: row.total_paid_paise ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    active: row.active === 1,
    sortOrder: row.sort_order,
    aliases: row.aliases ? row.aliases.split('|||').filter(Boolean) : []
  };
}

function mapMethod(row: PaymentMethodRow) {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    active: row.active === 1
  };
}

function mapListTransaction(row: TransactionListRow) {
  return {
    id: row.id,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    amountPaise: row.amount_paise,
    categoryId: row.category_id,
    categoryName: row.category_name,
    paymentMethodId: row.payment_method_id,
    paymentMethodName: row.payment_method_name,
    paymentMethodCode: row.payment_method_code,
    note: row.note,
    source: row.source,
    status: row.status,
    needsReview: row.needs_review === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version
  };
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export class LedgerService {
  private readonly transactions: TransactionService;

  constructor(private readonly runtime: DatabaseRuntime) {
    this.transactions = new TransactionService(new SqliteTransactionRepository(runtime.db));
  }

  private get sqlite(): Database.Database {
    return this.runtime.sqlite;
  }

  getMasterData(options: { includeInactive?: boolean } = {}) {
    const activeClause = options.includeInactive ? '' : 'WHERE p.active = 1';
    const payees = this.sqlite
      .prepare(
        `SELECT p.*,
          group_concat(DISTINCT pa.alias) AS aliases,
          count(DISTINCT CASE WHEN t.status = 'posted' THEN t.id END) AS payment_count,
          coalesce(sum(DISTINCT CASE WHEN t.status = 'posted' THEN t.amount_paise END), 0) AS total_paid_paise
        FROM payees p
        LEFT JOIN payee_aliases pa ON pa.payee_id = p.id
        LEFT JOIN transactions t ON t.payee_id = p.id
        ${activeClause}
        GROUP BY p.id
        ORDER BY p.favourite DESC, p.name COLLATE NOCASE`
      )
      .all() as PayeeRow[];
    const categoryWhere = options.includeInactive ? '' : 'WHERE c.active = 1';
    const categories = this.sqlite
      .prepare(
        `SELECT c.*, group_concat(ca.alias, '|||') AS aliases
         FROM categories c LEFT JOIN category_aliases ca ON ca.category_id = c.id
         ${categoryWhere}
         GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE`
      )
      .all() as CategoryRow[];
    const methodWhere = options.includeInactive ? '' : 'WHERE active = 1';
    const methods = this.sqlite
      .prepare(`SELECT * FROM payment_methods ${methodWhere} ORDER BY id`)
      .all() as PaymentMethodRow[];
    return {
      payees: payees.map(mapPayee),
      categories: categories.map(mapCategory),
      paymentMethods: methods.map(mapMethod)
    };
  }

  createPayee(input: CreatePayeeInput) {
    const name = requiredName(input.name);
    if (input.type !== 'person' && input.type !== 'company')
      throw new TypeError('Invalid payee type');
    const aliases = [
      ...new Set((input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))
    ];
    const create = this.sqlite.transaction(() => {
      const result = this.sqlite
        .prepare(
          `INSERT INTO payees
           (type, name, normalized_name, default_category_id, default_payment_method_id, favourite, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.type,
          name,
          normalizeLookupText(name),
          input.defaultCategoryId ?? null,
          input.defaultPaymentMethodId ?? null,
          input.favourite ? 1 : 0,
          input.notes?.trim() || null
        );
      const id = Number(result.lastInsertRowid);
      const aliasStatement = this.sqlite.prepare(
        'INSERT INTO payee_aliases (payee_id, alias, normalized_alias) VALUES (?, ?, ?)'
      );
      for (const alias of aliases) aliasStatement.run(id, alias, normalizeLookupText(alias));
      return id;
    });
    return this.getPayee(create());
  }

  updatePayee(id: number, input: Partial<CreatePayeeInput> & { active?: boolean }) {
    const existing = this.getPayee(id);
    const name = input.name === undefined ? existing.name : requiredName(input.name);
    const type = input.type ?? existing.type;
    const update = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE payees SET type = ?, name = ?, normalized_name = ?, default_category_id = ?,
           default_payment_method_id = ?, favourite = ?, active = ?, notes = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          type,
          name,
          normalizeLookupText(name),
          input.defaultCategoryId === undefined
            ? existing.defaultCategoryId
            : input.defaultCategoryId,
          input.defaultPaymentMethodId === undefined
            ? existing.defaultPaymentMethodId
            : input.defaultPaymentMethodId,
          input.favourite === undefined ? (existing.favourite ? 1 : 0) : input.favourite ? 1 : 0,
          input.active === undefined ? (existing.active ? 1 : 0) : input.active ? 1 : 0,
          input.notes === undefined ? existing.notes : input.notes?.trim() || null,
          nowIso(),
          id
        );
      if (input.aliases) {
        this.sqlite.prepare('DELETE FROM payee_aliases WHERE payee_id = ?').run(id);
        const insert = this.sqlite.prepare(
          'INSERT INTO payee_aliases (payee_id, alias, normalized_alias) VALUES (?, ?, ?)'
        );
        for (const alias of [
          ...new Set(input.aliases.map((value) => value.trim()).filter(Boolean))
        ]) {
          insert.run(id, alias, normalizeLookupText(alias));
        }
      }
    });
    update();
    return this.getPayee(id);
  }

  private getPayee(id: number) {
    const row = this.sqlite
      .prepare(
        `SELECT p.*, group_concat(pa.alias, '|||') AS aliases
         FROM payees p LEFT JOIN payee_aliases pa ON pa.payee_id = p.id
         WHERE p.id = ? GROUP BY p.id`
      )
      .get(id) as PayeeRow | undefined;
    if (!row) throw new RangeError(`Payee ${id} was not found`);
    return mapPayee(row);
  }

  createCategory(input: {
    name: string;
    parentId?: number | null;
    aliases?: string[];
    sortOrder?: number;
  }) {
    const name = requiredName(input.name);
    const create = this.sqlite.transaction(() => {
      const result = this.sqlite
        .prepare('INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)')
        .run(name, input.parentId ?? null, input.sortOrder ?? 0);
      const id = Number(result.lastInsertRowid);
      const aliases = [name, ...(input.aliases ?? [])];
      const insert = this.sqlite.prepare(
        'INSERT OR IGNORE INTO category_aliases (category_id, alias, normalized_alias) VALUES (?, ?, ?)'
      );
      for (const alias of aliases.map((value) => value.trim()).filter(Boolean)) {
        insert.run(id, alias, normalizeLookupText(alias));
      }
      return id;
    });
    const id = create();
    return this.getMasterData({ includeInactive: true }).categories.find(
      (category) => category.id === id
    );
  }

  updateCategory(
    id: number,
    input: {
      name?: string;
      parentId?: number | null;
      aliases?: string[];
      sortOrder?: number;
      active?: boolean;
    }
  ) {
    const current = this.getMasterData({ includeInactive: true }).categories.find(
      (category) => category.id === id
    );
    if (!current) throw new RangeError(`Category ${id} was not found`);
    const name = input.name === undefined ? current.name : requiredName(input.name);
    const update = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE categories SET name = ?, parent_id = ?, sort_order = ?, active = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          name,
          input.parentId === undefined ? current.parentId : input.parentId,
          input.sortOrder ?? current.sortOrder,
          input.active === undefined ? (current.active ? 1 : 0) : input.active ? 1 : 0,
          nowIso(),
          id
        );
      if (input.aliases || input.name) {
        this.sqlite.prepare('DELETE FROM category_aliases WHERE category_id = ?').run(id);
        const insert = this.sqlite.prepare(
          'INSERT INTO category_aliases (category_id, alias, normalized_alias) VALUES (?, ?, ?)'
        );
        for (const alias of [...new Set([name, ...(input.aliases ?? current.aliases)])]) {
          insert.run(id, alias, normalizeLookupText(alias));
        }
      }
    });
    update();
    return this.getMasterData({ includeInactive: true }).categories.find(
      (category) => category.id === id
    );
  }

  updatePaymentMethod(id: number, input: { displayName?: string; active?: boolean }) {
    const current = this.getMasterData({ includeInactive: true }).paymentMethods.find(
      (method) => method.id === id
    );
    if (!current) throw new RangeError(`Payment method ${id} was not found`);
    this.sqlite
      .prepare(
        'UPDATE payment_methods SET display_name = ?, active = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        input.displayName?.trim() || current.displayName,
        input.active === undefined ? (current.active ? 1 : 0) : input.active ? 1 : 0,
        nowIso(),
        id
      );
    return this.getMasterData({ includeInactive: true }).paymentMethods.find(
      (method) => method.id === id
    );
  }

  previewQuickEntry(command: string): QuickEntryPreview {
    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new TypeError('Enter a payment command');
    }
    const master = this.getMasterData();
    const preview = parseQuickEntry(command, {
      payees: master.payees.map((payee) => ({
        id: payee.id,
        name: payee.name,
        normalizedNames: [
          normalizeLookupText(payee.name),
          ...payee.aliases.map(normalizeLookupText)
        ],
        defaultCategoryId: payee.defaultCategoryId,
        defaultPaymentMethodId: payee.defaultPaymentMethodId
      })),
      categories: master.categories.map((category) => ({
        id: category.id,
        name: category.name,
        normalizedNames: [
          normalizeLookupText(category.name),
          ...category.aliases.map(normalizeLookupText)
        ]
      })),
      paymentMethods: master.paymentMethods.map((method) => ({
        id: method.id,
        code: method.code,
        displayName: method.displayName,
        aliases:
          method.code === 'cash'
            ? ['c', 'cash']
            : method.code === 'upi'
              ? ['u', 'upi']
              : method.code === 'bank'
                ? ['b', 'bank']
                : ['ch', 'cheque']
      }))
    });
    const clock = this.resolveCommandClock(command);
    return {
      ...preview,
      transactionDate: clock.date,
      transactionTime: clock.time,
      note:
        preview.note
          ?.replace(/\b(?:today|yesterday)\b/gi, '')
          .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
          .replace(
            /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|\d{1,2}[-/](?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[-/]\d{2,4})?)\b/gi,
            ''
          )
          .trim() || null
    };
  }

  private resolveCommandClock(command: string) {
    const current = businessNow();
    let date = current.date;
    const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(command);
    const numericIndian = /\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/.exec(command);
    const namedIndian =
      /\b(\d{1,2})[-/](jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[-/](\d{2,4}))?\b/i.exec(
        command
      );
    const normalizeYear = (value: string | undefined) =>
      value
        ? value.length === 2
          ? 2000 + Number(value)
          : Number(value)
        : Number(current.date.slice(0, 4));
    const validDate = (year: number, month: number, day: number) => {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      return candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() === month - 1 &&
        candidate.getUTCDate() === day
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
    };
    if (iso) date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? date;
    else if (namedIndian) {
      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec'
      ];
      const month = months.findIndex((name) => namedIndian[2]?.toLowerCase().startsWith(name)) + 1;
      date = validDate(normalizeYear(namedIndian[3]), month, Number(namedIndian[1])) ?? date;
    } else if (numericIndian) {
      date =
        validDate(
          normalizeYear(numericIndian[3]),
          Number(numericIndian[2]),
          Number(numericIndian[1])
        ) ?? date;
    } else if (/\byesterday\b/i.test(command)) {
      const previous = new Date(`${current.date}T12:00:00+05:30`);
      previous.setUTCDate(previous.getUTCDate() - 1);
      date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(previous);
    }
    let time = current.time;
    const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(command);
    if (match) {
      let hour = Number(match[1]) % 12;
      if (match[3]?.toLowerCase() === 'pm') hour += 12;
      time = `${String(hour).padStart(2, '0')}:${match[2] ?? '00'}:00`;
    }
    return { date, time };
  }

  async createFromCommand(
    command: string
  ): Promise<{
    transaction: TransactionRecord;
    duplicate: boolean;
    duplicateReason: string | null;
    createdPayee: boolean;
  }> {
    const preview = this.previewQuickEntry(command);
    if (!preview.valid || !preview.payeeName || !preview.amountPaise) {
      throw new TypeError(preview.errors.join('. ') || 'Command is incomplete');
    }
    let payeeId = preview.payeeId;
    let createdPayee = false;
    if (!payeeId && preview.isNewPayee) {
      const cashMethod = this.getMasterData().paymentMethods.find(
        (method) => method.code === 'cash'
      );
      const newPayee = this.createPayee({
        type: 'person',
        name: preview.payeeName,
        defaultCategoryId: null,
        defaultPaymentMethodId: cashMethod?.id ?? null
      });
      payeeId = newPayee.id;
      createdPayee = true;
    }
    if (!payeeId) throw new TypeError('Choose or enter a payee');
    const clock = {
      date: preview.transactionDate ?? businessNow().date,
      time: preview.transactionTime ?? businessNow().time
    };
    const duplicateMatch = this.sqlite
      .prepare(
        `SELECT CASE WHEN amount_paise = ? THEN 'Same payee and amount already recorded today'
                   ELSE 'This payee was paid during the last 30 minutes' END AS reason
       FROM transactions
       WHERE transaction_date = ? AND payee_id = ? AND status = 'posted'
         AND (amount_paise = ? OR created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'))
       ORDER BY (amount_paise = ?) DESC, id DESC LIMIT 1`
      )
      .get(preview.amountPaise, clock.date, payeeId, preview.amountPaise, preview.amountPaise) as
      { reason: string } | undefined;
    const transaction = await this.transactions.create({
      transactionDate: clock.date,
      transactionTime: clock.time,
      payeeId,
      amountPaise: preview.amountPaise,
      categoryId: preview.categoryId,
      paymentMethodId: preview.paymentMethodId,
      note: preview.note,
      source: 'web',
      needsReview: preview.needsReview
    });
    return {
      transaction,
      duplicate: Boolean(duplicateMatch),
      duplicateReason: duplicateMatch?.reason ?? null,
      createdPayee
    };
  }

  async createTransaction(input: {
    transactionDate?: string;
    transactionTime?: string;
    payeeId: number;
    amountPaise: number;
    categoryId: number | null;
    paymentMethodId: number | null;
    note: string | null;
    needsReview: boolean;
  }) {
    const clock = businessNow();
    return this.transactions.create({
      transactionDate: input.transactionDate ?? clock.date,
      transactionTime: input.transactionTime ?? clock.time,
      payeeId: input.payeeId,
      amountPaise: input.amountPaise,
      categoryId: input.categoryId,
      paymentMethodId: input.paymentMethodId,
      note: input.note,
      source: 'web',
      needsReview: input.needsReview
    });
  }

  createBatchTransactions(input: {
    rows: Array<{
      transactionDate: string;
      transactionTime?: string;
      payeeId: number;
      amountPaise: number;
      categoryId: number | null;
      paymentMethodId: number | null;
      note: string | null;
      needsReview?: boolean;
    }>;
  }) {
    if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 100) {
      throw new TypeError('Batch must contain 1 to 100 payments');
    }
    const clock = businessNow();
    const rows = input.rows.map((row) =>
      createTransactionSchema.parse({
        ...row,
        transactionTime: row.transactionTime ?? clock.time,
        source: 'web',
        needsReview: row.needsReview ?? (row.categoryId === null || row.paymentMethodId === null)
      })
    );
    return this.sqlite.transaction(() => {
      const insert = this.sqlite.prepare(
        `INSERT INTO transactions
         (transaction_date, transaction_time, payee_id, amount_paise, category_id,
          payment_method_id, note, source, needs_review)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'web', ?)`
      );
      const audit = this.sqlite.prepare(
        `INSERT INTO transaction_audit
         (transaction_id, action, previous_data, new_data, change_source)
         VALUES (?, 'created', NULL, ?, 'web')`
      );
      const created = [];
      for (const row of rows) {
        const result = insert.run(
          row.transactionDate,
          row.transactionTime,
          row.payeeId,
          row.amountPaise,
          row.categoryId,
          row.paymentMethodId,
          row.note,
          row.needsReview ? 1 : 0
        );
        const transaction = this.getTransaction(Number(result.lastInsertRowid));
        audit.run(transaction.id, JSON.stringify(transaction));
        created.push(transaction);
      }
      return { created, count: created.length };
    })();
  }

  async correctTransaction(id: number, input: Omit<CorrectTransactionInput, 'source'>) {
    return this.transactions.correct(id, { ...input, source: 'web' });
  }

  async voidTransaction(id: number, reason: string) {
    return this.transactions.void(id, reason, 'web');
  }

  listTransactions(options: ListTransactionOptions = {}) {
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (options.date) {
      conditions.push('t.transaction_date = ?');
      parameters.push(options.date);
    }
    if (options.from) {
      conditions.push('t.transaction_date >= ?');
      parameters.push(options.from);
    }
    if (options.to) {
      conditions.push('t.transaction_date <= ?');
      parameters.push(options.to);
    }
    if (options.search) {
      conditions.push('(p.name LIKE ? OR t.note LIKE ?)');
      parameters.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (options.methodId) {
      conditions.push('t.payment_method_id = ?');
      parameters.push(options.methodId);
    }
    if (options.categoryId) {
      conditions.push('t.category_id = ?');
      parameters.push(options.categoryId);
    }
    if (options.payeeId) {
      conditions.push('t.payee_id = ?');
      parameters.push(options.payeeId);
    }
    if (options.reviewOnly) conditions.push('t.needs_review = 1');
    if (!options.includeVoided) conditions.push("t.status = 'posted'");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const count = Number(
      (
        this.sqlite
          .prepare(
            `SELECT count(*) AS count FROM transactions t JOIN payees p ON p.id = t.payee_id ${where}`
          )
          .get(...parameters) as { count: number }
      ).count
    );
    const rows = this.sqlite
      .prepare(
        `SELECT t.*, p.name AS payee_name, c.name AS category_name,
          pm.display_name AS payment_method_name, pm.code AS payment_method_code
         FROM transactions t
         JOIN payees p ON p.id = t.payee_id
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         ${where}
         ORDER BY t.transaction_date DESC, t.transaction_time DESC, t.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...parameters, pageSize, (page - 1) * pageSize) as TransactionListRow[];
    return { items: rows.map(mapListTransaction), total: count, page, pageSize };
  }

  getTransactionAudit(transactionId: number) {
    return this.sqlite
      .prepare(
        `SELECT id, action, previous_data AS previousData, new_data AS newData,
         changed_at AS changedAt, change_source AS changeSource
         FROM transaction_audit WHERE transaction_id = ? ORDER BY id DESC`
      )
      .all(transactionId)
      .map((row) => {
        const typed = row as {
          id: number;
          action: string;
          previousData: string | null;
          newData: string;
          changedAt: string;
          changeSource: string;
        };
        return {
          ...typed,
          previousData: typed.previousData ? JSON.parse(typed.previousData) : null,
          newData: JSON.parse(typed.newData)
        };
      });
  }

  getActivity(limit = 100) {
    return this.sqlite
      .prepare(
        `SELECT ta.id, ta.action, ta.changed_at AS changedAt, ta.change_source AS source,
        t.id AS transactionId, t.amount_paise AS amountPaise, p.name AS payeeName
       FROM transaction_audit ta
       JOIN transactions t ON t.id = ta.transaction_id
       JOIN payees p ON p.id = t.payee_id
       ORDER BY ta.id DESC LIMIT ?`
      )
      .all(Math.min(Math.max(limit, 1), 250));
  }

  getSystemStatus() {
    const database = statSync(this.runtime.paths.databasePath);
    const backups = readdirSync(this.runtime.paths.backupDir)
      .filter((name) => name.endsWith('.sqlite3'))
      .map((name) => {
        const path = join(this.runtime.paths.backupDir, name);
        const stats = statSync(path);
        return { name, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() };
      })
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    const counts = this.sqlite
      .prepare(
        `SELECT count(*) AS total,
       sum(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) AS posted,
       sum(CASE WHEN status = 'voided' THEN 1 ELSE 0 END) AS voided,
       sum(CASE WHEN status = 'posted' AND needs_review = 1 THEN 1 ELSE 0 END) AS review
       FROM transactions`
      )
      .get() as { total: number; posted: number; voided: number; review: number };
    const payeeCount = Number(
      (
        this.sqlite.prepare('SELECT count(*) AS count FROM payees WHERE active = 1').get() as {
          count: number;
        }
      ).count
    );
    const lastActivity =
      (
        this.sqlite
          .prepare('SELECT changed_at AS changedAt FROM transaction_audit ORDER BY id DESC LIMIT 1')
          .get() as { changedAt: string } | undefined
      )?.changedAt ?? null;
    return {
      databasePath: this.runtime.paths.databasePath,
      databaseSizeBytes: database.size,
      integrity: String(this.sqlite.pragma('quick_check', { simple: true })),
      journalMode: String(this.sqlite.pragma('journal_mode', { simple: true })),
      foreignKeys: Number(this.sqlite.pragma('foreign_keys', { simple: true })) === 1,
      backupCount: backups.length,
      lastBackup: backups[0] ?? null,
      backupsSizeBytes: backups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
      counts,
      payeeCount,
      lastActivity
    };
  }

  getTransaction(transactionId: number) {
    const row = this.sqlite
      .prepare(
        `SELECT t.*, p.name AS payee_name, c.name AS category_name,
          pm.display_name AS payment_method_name, pm.code AS payment_method_code
         FROM transactions t
         JOIN payees p ON p.id = t.payee_id
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         WHERE t.id = ?`
      )
      .get(transactionId) as TransactionListRow | undefined;
    if (!row) throw new TransactionNotFoundError(`Transaction ${transactionId} was not found`);
    return mapListTransaction(row);
  }

  getDashboard(date = businessNow().date) {
    const totals = this.sqlite
      .prepare(
        `SELECT coalesce(sum(t.amount_paise), 0) AS total,
          count(*) AS count,
          coalesce(sum(CASE WHEN pm.code = 'cash' THEN t.amount_paise ELSE 0 END), 0) AS cash,
          coalesce(sum(CASE WHEN pm.code != 'cash' THEN t.amount_paise ELSE 0 END), 0) AS digital,
          sum(CASE WHEN t.needs_review = 1 THEN 1 ELSE 0 END) AS review_count
         FROM transactions t LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         WHERE t.transaction_date = ? AND t.status = 'posted'`
      )
      .get(date) as {
      total: number;
      count: number;
      cash: number;
      digital: number;
      review_count: number;
    };
    const recent = this.listTransactions({ date, pageSize: 12 }).items;
    const frequent = this.sqlite
      .prepare(
        `SELECT p.id, p.name, p.type, p.favourite, count(t.id) AS paymentCount,
          coalesce(sum(t.amount_paise), 0) AS totalPaidPaise
         FROM payees p LEFT JOIN transactions t ON t.payee_id = p.id AND t.status = 'posted'
         WHERE p.active = 1
         GROUP BY p.id ORDER BY p.favourite DESC, paymentCount DESC, p.name LIMIT 12`
      )
      .all();
    return {
      date,
      totalOutgoingPaise: totals.total,
      paymentCount: totals.count,
      cashPaise: totals.cash,
      digitalPaise: totals.digital,
      reviewCount: totals.review_count ?? 0,
      recent,
      frequent
    };
  }

  getReports(from: string, to: string) {
    const parameters = [from, to];
    const daily = this.sqlite
      .prepare(
        `SELECT t.transaction_date AS label, sum(t.amount_paise) AS totalPaise, count(*) AS paymentCount,
          sum(CASE WHEN pm.code = 'cash' THEN t.amount_paise ELSE 0 END) AS cashPaise,
          sum(CASE WHEN pm.code != 'cash' THEN t.amount_paise ELSE 0 END) AS nonCashPaise
         FROM transactions t LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         GROUP BY t.transaction_date ORDER BY t.transaction_date`
      )
      .all(...parameters);
    const categories = this.sqlite
      .prepare(
        `SELECT coalesce(c.name, 'Uncategorised') AS label, sum(t.amount_paise) AS totalPaise,
          count(*) AS paymentCount, round(avg(t.amount_paise)) AS averageTransactionPaise,
          count(DISTINCT t.transaction_date) AS activeDays,
          round(sum(t.amount_paise) * 1.0 / count(DISTINCT t.transaction_date)) AS averageActiveDayPaise
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         GROUP BY t.category_id ORDER BY totalPaise DESC`
      )
      .all(...parameters);
    const methods = this.sqlite
      .prepare(
        `SELECT coalesce(pm.display_name, 'Needs review') AS label, pm.code,
          sum(t.amount_paise) AS totalPaise, count(*) AS paymentCount,
          round(avg(t.amount_paise)) AS averageTransactionPaise
         FROM transactions t LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         GROUP BY t.payment_method_id ORDER BY totalPaise DESC`
      )
      .all(...parameters);
    const payees = this.sqlite
      .prepare(
        `SELECT p.id, p.name AS label, p.type, sum(t.amount_paise) AS totalPaise, count(*) AS paymentCount
         FROM transactions t JOIN payees p ON p.id = t.payee_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         GROUP BY p.id ORDER BY totalPaise DESC LIMIT 50`
      )
      .all(...parameters);
    const largest = this.sqlite
      .prepare(
        `SELECT t.id, t.transaction_date AS transactionDate, p.name AS payeeName,
          t.amount_paise AS amountPaise, t.note
         FROM transactions t JOIN payees p ON p.id = t.payee_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         ORDER BY t.amount_paise DESC LIMIT 20`
      )
      .all(...parameters);
    const repeated = this.sqlite
      .prepare(
        `SELECT p.name AS payeeName, t.amount_paise AS amountPaise, count(*) AS occurrences
         FROM transactions t JOIN payees p ON p.id = t.payee_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
         GROUP BY t.payee_id, t.amount_paise HAVING count(*) > 1
         ORDER BY occurrences DESC, amountPaise DESC LIMIT 20`
      )
      .all(...parameters);
    const unusual = this.sqlite
      .prepare(
        `SELECT t.id, t.transaction_date AS transactionDate, p.name AS payeeName,
          t.amount_paise AS amountPaise, round(avg_for_payee.average) AS averagePaise
         FROM transactions t JOIN payees p ON p.id = t.payee_id
         JOIN (
           SELECT payee_id, avg(amount_paise) AS average FROM transactions WHERE status = 'posted' GROUP BY payee_id
         ) avg_for_payee ON avg_for_payee.payee_id = t.payee_id
         WHERE t.status = 'posted' AND t.transaction_date BETWEEN ? AND ?
           AND t.amount_paise >= 5000000 AND t.amount_paise >= avg_for_payee.average * 2
         ORDER BY t.amount_paise DESC LIMIT 20`
      )
      .all(...parameters);
    const totals = this.sqlite
      .prepare(
        `SELECT coalesce(sum(amount_paise), 0) AS totalPaise, count(*) AS paymentCount,
          count(DISTINCT payee_id) AS payeeCount, count(DISTINCT transaction_date) AS activeDayCount,
          coalesce(round(avg(amount_paise)), 0) AS averageTransactionPaise
         FROM transactions WHERE status = 'posted' AND transaction_date BETWEEN ? AND ?`
      )
      .get(...parameters);
    return { from, to, totals, daily, categories, methods, payees, largest, repeated, unusual };
  }

  exportTransactionsCsv(options: ListTransactionOptions): string {
    const items = this.listTransactions({ ...options, page: 1, pageSize: 100 }).items;
    const rows = [
      [
        'Date',
        'Time',
        'Payee',
        'Amount paise',
        'Category',
        'Method',
        'Note',
        'Source',
        'Status',
        'Needs review'
      ],
      ...items.map((item) => [
        item.transactionDate,
        item.transactionTime,
        item.payeeName,
        item.amountPaise,
        item.categoryName,
        item.paymentMethodName,
        item.note,
        item.source,
        item.status,
        item.needsReview ? 'yes' : 'no'
      ])
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  async createBackup() {
    const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
    const destination = join(this.runtime.paths.backupDir, `manual-${stamp}.sqlite3`);
    await this.runtime.sqlite.backup(destination);
    const integrity = verifyDatabaseIntegrity(destination);
    if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);
    return { filename: destination.split(/[\\/]/).at(-1), integrity };
  }
}
