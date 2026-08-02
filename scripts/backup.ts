import { renameSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, verifyDatabaseIntegrity } from '../packages/database/dist/index.js';

const retention = { daily: 14, weekly: 8, monthly: 12 } as const;
type BackupTier = keyof typeof retention;
const tierArgument = process.argv.find((argument) => argument.startsWith('--tier='));
const tier = (tierArgument?.slice('--tier='.length) ?? 'daily') as BackupTier;
if (!(tier in retention)) throw new Error('Backup tier must be daily, weekly, or monthly');

const runtime = openDatabase({ migrate: false });
const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const filename = `${tier}-${stamp}.sqlite3`;
const destination = join(runtime.paths.backupDir, filename);
const temporary = `${destination}.tmp`;

try {
  await runtime.sqlite.backup(temporary);
  const integrity = verifyDatabaseIntegrity(temporary);
  if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${String(integrity)}`);
  rmSync(`${temporary}-shm`, { force: true });
  rmSync(`${temporary}-wal`, { force: true });
  renameSync(temporary, destination);

  const matching = readdirSync(runtime.paths.backupDir)
    .filter((name) => name.startsWith(`${tier}-`) && name.endsWith('.sqlite3'))
    .sort()
    .reverse();
  for (const expired of matching.slice(retention[tier])) {
    rmSync(join(runtime.paths.backupDir, expired));
  }
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', tier, backup: destination, integrity })}\n`
  );
} catch (error) {
  rmSync(temporary, { force: true });
  rmSync(`${temporary}-shm`, { force: true });
  rmSync(`${temporary}-wal`, { force: true });
  throw error;
} finally {
  await runtime.close();
}
