import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '../api/client';
import { ShieldCheck, Database, HardDrive, RefreshCw, AlertTriangle, CheckCircle2, DownloadCloud } from 'lucide-react';
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
  const [backingUp, setBackingUp] = useState(false);

  const { data: status, isLoading, refetch, isError } = useQuery<Status>({
    queryKey: ['system-status'],
    queryFn: () => api<Status>('/system/status')
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success('System dashboard refreshed');
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const result = await post<{ filename: string }>('/system/backup', {});
      toast.success('Backup created and verified!', { description: result.filename });
      await refetch();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  // Status Banner Logic (Section 4.6 Spec)
  const isHealthy = status?.integrity === 'ok';
  const isBackupOverdue = status?.lastBackup
    ? (new Date().getTime() - new Date(status.lastBackup.modifiedAt).getTime()) > 7 * 24 * 3600 * 1000
    : true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">System</h1>
          <p className="mt-1 text-sm text-[#667085]">Database health and backups.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary h-10 px-3 text-[#667085] hover:text-[#111827]"
            title="Refresh system status"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="btn btn-primary h-10 px-4 gap-2 shadow-xs"
          >
            <DownloadCloud size={16} className={backingUp ? 'animate-spin' : ''} />
            <span>{backingUp ? 'Backing up...' : 'Back Up Now'}</span>
          </button>
        </div>
      </div>

      {isError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <AlertTriangle size={18} />
          <span>Failed to fetch system status. Please verify the Node server is running.</span>
        </div>
      )}

      {status && (
        <>
          {/* Reusable Status Banner Component (Section 4.6 Spec) */}
          <div
            className={`p-5 rounded-2xl border flex items-center justify-between gap-4 ${
              !isHealthy
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : isBackupOverdue
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {!isHealthy ? (
                <AlertTriangle size={24} className="text-rose-600 shrink-0" />
              ) : isBackupOverdue ? (
                <AlertTriangle size={24} className="text-amber-600 shrink-0" />
              ) : (
                <ShieldCheck size={24} className="text-[#00B96B] shrink-0" />
              )}
              <div>
                <h3 className="font-extrabold text-base">
                  {!isHealthy
                    ? 'Database Error / Issue Detected'
                    : isBackupOverdue
                    ? 'Database Healthy (Backup Recommended)'
                    : 'System Fully Operational & Healthy'}
                </h3>
                <p className="text-xs mt-0.5 opacity-80">
                  SQLite {status.journalMode.toUpperCase()} · Foreign keys{' '}
                  {status.foreignKeys ? 'enabled' : 'disabled'} · Last activity:{' '}
                  {status.lastActivity
                    ? new Date(status.lastActivity).toLocaleString('en-IN')
                    : 'none'}
                </p>
              </div>
            </div>
          </div>

          {/* System Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-[#165DFF] mb-2">
                <Database size={20} />
                <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Database Size
                </span>
              </div>
              <span className="text-2xl font-black text-[#111827] tabular-nums block">
                {formatSize(status.databaseSizeBytes)}
              </span>
              <span className="text-xs text-[#667085] truncate block mt-2" title={status.databasePath}>
                {status.databasePath}
              </span>
            </div>

            <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-[#00B96B] mb-2">
                <HardDrive size={20} />
                <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Backups Storage
                </span>
              </div>
              <span className="text-2xl font-black text-[#111827] tabular-nums block">
                {formatSize(status.backupsSizeBytes)}
              </span>
              <span className="text-xs text-[#667085] block mt-2">
                {status.backupCount} verified B2/local backups
              </span>
            </div>

            <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-[#F79009] mb-2">
                <CheckCircle2 size={20} />
                <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Total Records
                </span>
              </div>
              <span className="text-2xl font-black text-[#111827] tabular-nums block">
                {status.counts.total}
              </span>
              <span className="text-xs text-[#667085] block mt-2">
                {status.payeeCount} registered payees
              </span>
            </div>
          </div>

          {/* Last Backup Details */}
          {status.lastBackup && (
            <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs space-y-3">
              <h3 className="font-bold text-base text-[#111827]">Most Recent Verified Backup</h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-800 block text-sm">
                    {status.lastBackup.name}
                  </span>
                  <span className="text-[#667085]">
                    Created {new Date(status.lastBackup.modifiedAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                  {formatSize(status.lastBackup.sizeBytes)}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
