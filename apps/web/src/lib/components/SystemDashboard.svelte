<script lang="ts">
  import { onMount } from 'svelte';
  import { api, post } from '$lib/api';
  import { CheckCircle2, Database, HardDrive, RefreshCw, ShieldCheck } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  interface Status {
    databasePath: string;
    databaseSizeBytes: number;
    integrity: string;
    journalMode: string;
    foreignKeys: boolean;
    backupCount: number;
    lastBackup: { name: string; sizeBytes: number; modifiedAt: string } | null;
    backupsSizeBytes: number;
    counts: { total: number; posted: number; voided: number; review: number };
    payeeCount: number;
    lastActivity: string | null;
  }
  let status = $state<Status | null>(null);
  let error = $state('');
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  async function load() {
    try {
      status = await api<Status>('/system/status');
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'System status unavailable';
    }
  }
  async function backup() {
    try {
      const result = await post<{ filename: string }>('/system/backup', {});
      toast.success('Backup verified', { description: result.filename });
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Backup failed';
    }
  }
  onMount(() => void load());
</script>

<div class="page-stack system-page">
  <header class="page-header">
    <div><h1>System</h1></div>
    <button class="button secondary" onclick={() => void load()}
      ><RefreshCw size={14} />Refresh</button
    >
  </header>
  {#if error}<div class="notice error">{error}</div>{/if}
  {#if status}
    <section class="system-health-banner">
      <ShieldCheck size={22} />
      <div>
        <strong
          >{status.integrity === 'ok' ? 'Database healthy' : 'Database needs attention'}</strong
        ><span
          >SQLite {status.journalMode.toUpperCase()} · foreign keys {status.foreignKeys
            ? 'on'
            : 'off'} · last activity {status.lastActivity
            ? new Date(status.lastActivity).toLocaleString('en-IN', { hour12: true })
            : 'none'}</span
        >
      </div>
    </section>
    <section class="system-grid">
      <article class="panel">
        <Database size={18} /><small>Database</small><strong
          >{size(status.databaseSizeBytes)}</strong
        ><span>{status.databasePath}</span>
      </article>
      <article class="panel">
        <HardDrive size={18} /><small>Verified backups</small><strong>{status.backupCount}</strong
        ><span>{size(status.backupsSizeBytes)} total</span>
      </article>
      <article class="panel">
        <CheckCircle2 size={18} /><small>Last backup</small><strong
          >{status.lastBackup
            ? new Date(status.lastBackup.modifiedAt).toLocaleDateString('en-IN')
            : 'None'}</strong
        ><span>{status.lastBackup?.name ?? 'Create the first backup now'}</span>
      </article>
    </section>
    <section class="system-ledger-counts">
      <article><small>Posted</small><strong>{status.counts.posted}</strong></article>
      <article><small>Needs review</small><strong>{status.counts.review}</strong></article>
      <article><small>Voided</small><strong>{status.counts.voided}</strong></article>
      <article><small>Active payees</small><strong>{status.payeeCount}</strong></article>
    </section>
    <section class="panel system-backup-action">
      <div>
        <h2>Create verified backup</h2>
        <p>Uses SQLite’s online backup API and verifies the resulting file.</p>
      </div>
      <button class="button primary" onclick={() => void backup()}>Back up now</button>
    </section>
  {/if}
</div>
