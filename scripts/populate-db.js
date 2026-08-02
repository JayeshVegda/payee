const Database = require('C:/Users/Kapil/Documents/zen_downlaod/payee/node_modules/.pnpm/better-sqlite3@13.0.2/node_modules/better-sqlite3');
const { mkdirSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const dbPath = 'C:/Users/Kapil/AppData/Local/PaymentLedger/data/ledger.sqlite3';
mkdirSync('C:/Users/Kapil/AppData/Local/PaymentLedger/data', { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// 1. Migrate Database
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT, WITHOUT ROWID;
`);

const migrationsDir = 'C:/Users/Kapil/Documents/zen_downlaod/payee/migrations';
const files = readdirSync(migrationsDir).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  const applied = db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(file);
  if (!applied) {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name, checksum) VALUES (?, "seed")').run(file);
  }
}

// 2. Clear previous data
db.exec('DELETE FROM transaction_audit; DELETE FROM transactions; DELETE FROM payee_aliases; DELETE FROM payees;');

// 3. Seed payees
const payees = [
  { name: 'Ramesh Kumar', type: 'person', cat: 'Wages', method: 'cash', favourite: 1, min: 650, max: 1800, notes: 'daily wages' },
  { name: 'Mahesh Transport', type: 'company', cat: 'Transport', method: 'bank', favourite: 1, min: 2500, max: 18000, notes: 'truck hire' },
  { name: 'ABC Tools', type: 'company', cat: 'Tools', method: 'bank', favourite: 1, min: 1200, max: 24000, notes: 'drill bits & discs' },
  { name: 'Suresh Yadav', type: 'person', cat: 'Wages', method: 'cash', favourite: 0, min: 650, max: 1600, notes: 'loading wages' },
  { name: 'Imran Sheikh', type: 'person', cat: 'Wages', method: 'upi', favourite: 0, min: 700, max: 2200, notes: 'fabrication work' },
  { name: 'Shree Ganesh Suppliers', type: 'company', cat: 'Supplier', method: 'bank', favourite: 0, min: 4500, max: 42000, notes: 'hardware supplies' },
  { name: 'Patel Steel Traders', type: 'company', cat: 'Materials', method: 'cheque', favourite: 1, min: 12000, max: 85000, notes: 'steel sections' },
  { name: 'Vijay Courier Service', type: 'company', cat: 'Courier', method: 'upi', favourite: 0, min: 180, max: 1800, notes: 'dispatch' },
  { name: 'Lakshmi Electricals', type: 'company', cat: 'Materials', method: 'upi', favourite: 0, min: 800, max: 16000, notes: 'cables & parts' },
  { name: 'Anil Verma', type: 'person', cat: 'Wages', method: 'cash', favourite: 0, min: 550, max: 1300, notes: 'helper wages' },
  { name: 'City Crane Services', type: 'company', cat: 'Transport', method: 'bank', favourite: 0, min: 6500, max: 38000, notes: 'crane hire' },
  { name: 'Om Hardware Mart', type: 'company', cat: 'Tools', method: 'cash', favourite: 0, min: 500, max: 9500, notes: 'fasteners' }
];

const catRows = db.prepare('SELECT id, name FROM categories').all();
const methodRows = db.prepare('SELECT id, code FROM payment_methods').all();
const catMap = new Map(catRows.map(c => [c.name, c.id]));
const methodMap = new Map(m => [m.code, m.id]);

const insertPayee = db.prepare(`INSERT INTO payees (type, name, normalized_name, default_category_id, default_payment_method_id, active, notes, favourite) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
const payeeMap = new Map();

for (const p of payees) {
  const res = insertPayee.run(p.type, p.name, p.name.toLowerCase(), catMap.get(p.cat) || 1, methodMap.get(p.method) || 1, p.notes, p.favourite);
  payeeMap.set(p.name, Number(res.lastInsertRowid));
}

const insertTx = db.prepare(`INSERT INTO transactions (transaction_date, transaction_time, payee_id, amount_paise, category_id, payment_method_id, note, source, status, needs_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'web', 'posted', ?, ?, ?)`);
const insertAudit = db.prepare(`INSERT INTO transaction_audit (transaction_id, action, previous_data, new_data, changed_at, change_source) VALUES (?, 'created', NULL, ?, ?, 'web')`);

let totalTx = 0;
let seed = 12345;
function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

// Generate historical data
const start = new Date('2026-02-01T00:00:00Z');
const end = new Date('2026-08-01T00:00:00Z');

for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const dateStr = d.toISOString().slice(0, 10);
  const count = d.getUTCDay() === 0 ? 0 : d.getUTCDay() === 6 ? 2 : 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const p = payees[Math.floor(rand() * payees.length)];
    const amt = Math.round((p.min + rand() * (p.max - p.min)) / 10) * 1000;
    const h = 8 + Math.floor(rand() * 11);
    const m = Math.floor(rand() * 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    const review = rand() < 0.04 ? 1 : 0;
    const ts = `${dateStr}T${timeStr}.000Z`;
    const res = insertTx.run(dateStr, timeStr, payeeMap.get(p.name), amt, catMap.get(p.cat) || 1, methodMap.get(p.method) || 1, `[DEMO] ${p.notes}`, review, ts, ts);
    const id = Number(res.lastInsertRowid);
    insertAudit.run(id, JSON.stringify({ id, date: dateStr, amount: amt }), ts);
    totalTx++;
  }
}

// Generate Today transactions: 2026-08-02
const todayStr = '2026-08-02';
const todayItems = [
  { payee: 'Ramesh Kumar', amt: 120000, cat: 'Wages', method: 'cash', note: '[DEMO] Daily site labor wages', time: '10:15:00' },
  { payee: 'Mahesh Transport', amt: 450000, cat: 'Transport', method: 'bank', note: '[DEMO] Material delivery truck hire', time: '11:30:00' },
  { payee: 'ABC Tools', amt: 1800000, cat: 'Tools', method: 'bank', note: '[DEMO] Cutting discs and drill set', time: '13:45:00' },
  { payee: 'Suresh Yadav', amt: 200000, cat: 'Wages', method: 'cash', note: '[DEMO] Helper loading overtime', time: '14:20:00' },
  { payee: 'Patel Steel Traders', amt: 3000000, cat: 'Materials', method: 'cheque', note: '[DEMO] Steel plates advance payment', time: '15:10:00' }
];

for (const t of todayItems) {
  const ts = `${todayStr}T${t.time}.000Z`;
  const res = insertTx.run(todayStr, t.time, payeeMap.get(t.payee), t.amt, catMap.get(t.cat) || 1, methodMap.get(t.method) || 1, t.note, 0, ts, ts);
  const id = Number(res.lastInsertRowid);
  insertAudit.run(id, JSON.stringify({ id, date: todayStr, amount: t.amt }), ts);
  totalTx++;
}

console.log(`Successfully populated database with ${payees.length} payees and ${totalTx} transactions!`);
db.close();
