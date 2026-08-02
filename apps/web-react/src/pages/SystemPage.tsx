import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '../api/client';
import { ShieldCheck, Database, HardDrive, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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

export default function SystemPage() {
  const { data: status, isLoading, refetch, isError } = useQuery<Status>({
    queryKey: ['system-status'],
    queryFn: () => api<Status>('/system/status')
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success('System dashboard refreshed');
  };

  const handleBackup = async () => {
    try {
      const result = await post<{ filename: string }>('/system/backup', {});
      toast.success('Backup verified', { description: result.filename });
      await refetch();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Backup failed');
    }
  };

  const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink font-sans">
            System Dashboard
          </h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {isError && (
        <div className="p-3 text-xs bg-ledger-review/10 border border-ledger-review/20 text-ledger-review rounded-md">
          Failed to fetch system status. Is apps/server running?
        </div>
      )}

      {status && (
        <>
          {/* Health Banner */}
          <section className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <strong className="block text-sm font-bold text-emerald-900 leading-tight">
                {status.integrity === 'ok' ? 'Database Healthy' : 'Database Needs Attention'}
              </strong>
              <span className="block text-emerald-700 font-medium mt-0.5">
                SQLite {status.journalMode.toUpperCase()} · Foreign keys{' '}
                {status.foreignKeys ? 'enabled' : 'disabled'} · Last activity:{' '}
                {status.lastActivity
                  ? new Date(status.lastActivity).toLocaleString('en-IN', { hour12: true })
                  : 'none'}
              </span>
            </div>
          </section>

          {/* Stats Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <article className="ledger-card p-5 border-ledger-border shadow-xs bg-white flex flex-col justify-between min-h-[100px]">
              <div className="flex items-center gap-2 text-ledger-blue">
                <Database className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold text-ledger-muted uppercase tracking-wider">
                  Database Size
                </span>
              </div>
              <strong className="text-xl font-mono font-bold text-ledger-ink tracking-tight mt-2 block tabular-nums">
                {formatSize(status.databaseSizeBytes)}
              </strong>
              <span className="text-[10px] text-ledger-muted block truncate mt-1" title={status.databasePath}>
                Path: {status.databasePath}
              </span>
            </article>

            <article className="ledger-card p-5 border-ledger-border shadow-xs bg-white flex flex-col justify-between min-h-[100px]">
              <div className="flex items-center gap-2 text-ledger-blue">
                <HardDrive className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold text-ledger-muted uppercase tracking-wider">
                  Verified Backups
                </span>
              </div>
              <strong className="text-xl font-mono font-bold text-ledger-ink tracking-tight mt-2 block tabular-nums">
                {status.backupCount}
              </strong>
              <span className="text-[10px] text-ledger-muted block truncate mt-1">
                Size: {formatSize(status.backupsSizeBytes)} total
              </span>
            </article>

            <article className="ledger-card p-5 border-ledger-border shadow-xs bg-white flex flex-col justify-between min-h-[100px]">
              <div className="flex items-center gap-2 text-ledger-blue">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold text-ledger-muted uppercase tracking-wider">
                  Last Backup
                </span>
              </div>
              <strong className="text-xl font-mono font-bold text-ledger-ink tracking-tight mt-2 block">
                {status.lastBackup
                  ? new Date(status.lastBackup.modifiedAt).toLocaleDateString('en-IN')
                  : 'None'}
              </strong>
              <span className="text-[10px] text-ledger-muted block truncate mt-1" title={status.lastBackup?.name ?? ''}>
                {status.lastBackup?.name ?? 'Create the first backup now'}
              </span>
            </article>
          </section>

          {/* Counts metrics */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <article className="ledger-card py-3 px-4 border-ledger-border bg-white text-center">
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">Posted</span>
              <strong className="text-xl font-mono font-bold text-ledger-ink block mt-1 tabular-nums">
                {status.counts.posted}
              </strong>
            </article>
            <article className="ledger-card py-3 px-4 border-ledger-border bg-white text-center">
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">Review</span>
              <strong className="text-xl font-mono font-bold text-ledger-ink block mt-1 tabular-nums">
                {status.counts.review}
              </strong>
            </article>
            <article className="ledger-card py-3 px-4 border-ledger-border bg-white text-center">
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">Voided</span>
              <strong className="text-xl font-mono font-bold text-ledger-ink block mt-1 tabular-nums">
                {status.counts.voided}
              </strong>
            </article>
            <article className="ledger-card py-3 px-4 border-ledger-border bg-white text-center">
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">Active Payees</span>
              <strong className="text-xl font-mono font-bold text-ledger-ink block mt-1 tabular-nums">
                {status.payeeCount}
              </strong>
            </article>
          </section>

          {/* Action Panel */}
          <section className="ledger-card border-ledger-border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-sm font-bold text-ledger-ink uppercase tracking-wider">
                Create Verified Backup
              </h2>
              <p className="text-xs text-ledger-muted mt-1 leading-normal">
                Utilizes SQLite's online incremental backup API to produce an integer-verified copy.
              </p>
            </div>
            <button onClick={handleBackup} className="btn btn-primary text-xs py-2 px-5 shrink-0 hover:shadow-sm">
              Back up now
            </button>
          </section>
        </>
      )}
    </div>
  );
}
