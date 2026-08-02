import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr } from '../api/client';
import { RefreshCw, History } from 'lucide-react';
import { toast } from 'sonner';

interface Event {
  id: number;
  action: string;
  changedAt: string;
  source: string;
  transactionId: number;
  amountPaise: number;
  payeeName: string;
}

export default function ActivityPage() {
  const { data: events = [], isLoading, refetch } = useQuery<Event[]>({
    queryKey: ['activity-events'],
    queryFn: () => api<Event[]>('/activity?limit=150')
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success('Activity log refreshed');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink font-sans">
            Activity Log
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

      {/* Main List */}
      <section className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
        <div className="divide-y divide-ledger-border/40">
          {events.map((event) => {
            let actionColor = 'bg-ledger-blue/10 text-ledger-blue';
            if (event.action === 'void') {
              actionColor = 'bg-red-50 text-red-700 border border-red-200';
            } else if (event.action === 'correct') {
              actionColor = 'bg-amber-50 text-amber-800 border border-amber-200';
            }

            return (
              <article
                key={event.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-ledger-selection/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs uppercase shrink-0 ${actionColor}`}
                  >
                    {event.action.slice(0, 1)}
                  </span>
                  <div>
                    <strong className="text-sm font-semibold text-ledger-ink leading-tight">
                      {event.payeeName} · <span className="capitalize">{event.action}</span>
                    </strong>
                    <div className="text-[10px] text-ledger-muted mt-0.5 font-medium">
                      {new Date(event.changedAt).toLocaleString('en-IN', { hour12: true })} ·{' '}
                      <span className="uppercase">{event.source}</span> · Transaction #{event.transactionId}
                    </div>
                  </div>
                </div>
                <strong className="font-mono text-xs font-bold text-ledger-ink shrink-0 tabular-nums">
                  {formatInr(event.amountPaise)}
                </strong>
              </article>
            );
          })}
          {events.length === 0 && !isLoading && (
            <div className="py-16 text-center text-ledger-muted space-y-3">
              <History className="w-8 h-8 text-ledger-muted mx-auto bg-ledger-workspace p-1.5 rounded-full" />
              <strong className="block text-ledger-ink font-semibold text-sm">No activity records</strong>
              <p className="text-xs">Database audit events will appear here once transactions are recorded.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
