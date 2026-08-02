import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr, post, queryString, rupeesToPaise } from '../api/client';
import { Download, RefreshCw, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import TransactionDetailDrawer from '../components/transactions/TransactionDetailDrawer';

// Lazy load ECharts implementation to keep the bundle size small
const ReportCharts = React.lazy(() => import('../components/reports/ReportCharts'));

interface GroupRow {
  label: string;
  totalPaise: number;
  paymentCount: number;
  averageTransactionPaise?: number;
  averageActiveDayPaise?: number;
  activeDays?: number;
  code?: string | null;
  cashPaise?: number;
  nonCashPaise?: number;
}

interface ReportTransaction {
  id: number;
  transactionDate: string;
  payeeName: string;
  amountPaise: number;
  note?: string | null;
  averagePaise?: number;
}

interface ReportsData {
  from: string;
  to: string;
  totals: {
    totalPaise: number;
    paymentCount: number;
    payeeCount: number;
    activeDayCount: number;
    averageTransactionPaise: number;
  };
  daily: GroupRow[];
  categories: GroupRow[];
  methods: GroupRow[];
  payees: Array<GroupRow & { id: number; type: string }>;
  largest: ReportTransaction[];
  repeated: Array<{ payeeName: string; amountPaise: number; occurrences: number }>;
  unusual: ReportTransaction[];
}

export default function ReportsPage() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [backupMessage, setBackupMessage] = useState('');

  // Fetch report data
  const {
    data,
    isLoading: loading,
    refetch,
    isError
  } = useQuery<ReportsData>({
    queryKey: ['reports-data', from, to],
    queryFn: () => api<ReportsData>(`/reports${queryString({ from, to })}`),
    staleTime: 30000
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success('Report data updated');
  };

  const setRangePreset = (days: number | 'month' | 'six-months') => {
    const end = new Date();
    if (days === 'month') {
      setFrom(`${today.slice(0, 8)}01`);
    } else {
      const start = new Date();
      if (days === 'six-months') {
        start.setMonth(start.getMonth() - 6);
      } else {
        start.setDate(start.getDate() - days + 1);
      }
      const localFrom = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(start);
      setFrom(localFrom);
    }
    setTo(today);
  };

  const handleBackup = async () => {
    try {
      const result = await post<{ filename: string; integrity: string }>('/system/backup', {});
      setBackupMessage(`${result.filename} created and verified.`);
      toast.success('Verified backup created successfully.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Backup could not be created');
    }
  };

  const averageActiveDay = data?.totals.activeDayCount
    ? Math.round(data.totals.totalPaise / data.totals.activeDayCount)
    : 0;

  const cashTotal = data?.methods.find((row) => row.code === 'cash')?.totalPaise ?? 0;
  const cashShare = data?.totals.totalPaise
    ? Math.round((cashTotal / data.totals.totalPaise) * 100)
    : 0;

  const topCategory = data?.categories[0] ?? null;

  const categoryColors = ['#16274d', '#6c97d6', '#2b5dab', '#a3bfe8', '#1e3d73', '#cbdbf3', '#3b72c4', '#e4edfb'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink font-sans">
            Reports
          </h1>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/export/transactions.csv${queryString({ from, to })}`}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <button
            onClick={() => window.print()}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
          >
            Print Summary
          </button>
        </div>
      </header>

      {/* Range controls */}
      <section className="ledger-card p-4 border-ledger-border bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-semibold text-ledger-ink select-none">
        <div className="flex flex-wrap gap-2">
          {(
            [
              [7, '7 days'],
              [30, '30 days'],
              ['month', 'This month'],
              ['six-months', '6 months']
            ] as const
          ).map(([preset, label]) => (
            <button
              key={label}
              onClick={() => setRangePreset(preset)}
              className="px-2.5 py-1.5 border border-ledger-border hover:border-ledger-blue hover:text-ledger-blue bg-white rounded-md transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-ledger-muted font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="form-input py-1 text-xs font-medium"
            />
          </label>
          <span className="text-ledger-muted select-none">→</span>
          <label className="flex items-center gap-2">
            <span className="text-ledger-muted font-medium">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="form-input py-1 text-xs font-medium"
            />
          </label>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn btn-primary text-xs py-1.5 px-4 flex items-center gap-1 hover:shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Apply
          </button>
        </div>
      </section>

      {isError && (
        <div className="p-3 text-xs bg-ledger-review/10 border border-ledger-review/20 text-ledger-review rounded-md">
          Failed to load reports. Is apps/server running?
        </div>
      )}

      {data && (
        <>
          {/* Hero stats grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border bg-white shadow-xs">
              <span className="text-xs font-semibold text-ledger-muted">Total outgoing</span>
              <strong className="text-xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
                {formatInr(data.totals.totalPaise)}
              </strong>
              <span className="text-[10px] text-ledger-muted mt-0.5 truncate font-medium">
                {from} – {to}
              </span>
            </article>

            <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border bg-white shadow-xs">
              <span className="text-xs font-semibold text-ledger-muted">Average active day</span>
              <strong className="text-xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
                {formatInr(averageActiveDay)}
              </strong>
              <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
                {data.totals.activeDayCount} active payment days
              </span>
            </article>

            <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border bg-white shadow-xs">
              <span className="text-xs font-semibold text-ledger-muted">Average payment</span>
              <strong className="text-xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
                {formatInr(data.totals.averageTransactionPaise)}
              </strong>
              <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
                {data.totals.paymentCount} total transactions
              </span>
            </article>

            <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border bg-white shadow-xs">
              <span className="text-xs font-semibold text-ledger-muted">Paid in Cash</span>
              <strong className="text-xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
                {formatInr(cashTotal)}
              </strong>
              <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
                {cashShare}% of total spending
              </span>
            </article>
          </section>

          {/* Insights strip */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 bg-ledger-workspace/30 border-y border-ledger-border/40 select-none">
            <div className="px-4 py-1 text-center sm:text-left">
              <span className="text-[10px] text-ledger-muted font-bold uppercase block">Largest Category</span>
              <strong className="text-sm font-semibold text-ledger-ink block mt-0.5 leading-tight">
                {topCategory?.label || 'No data'}
              </strong>
              <small className="text-[10px] text-ledger-muted font-mono block mt-0.5 tabular-nums">
                {topCategory ? formatInr(topCategory.totalPaise) : '—'}
              </small>
            </div>
            <div className="px-4 py-1 text-center sm:text-left border-y sm:border-y-0 sm:border-x border-ledger-border/50">
              <span className="text-[10px] text-ledger-muted font-bold uppercase block">Unique Payees Paid</span>
              <strong className="text-sm font-semibold text-ledger-ink block mt-0.5 leading-tight">
                {data.totals.payeeCount}
              </strong>
              <small className="text-[10px] text-ledger-muted block mt-0.5 font-medium">
                Distinct payees in date range
              </small>
            </div>
            <div className="px-4 py-1 text-center sm:text-left">
              <span className="text-[10px] text-ledger-muted font-bold uppercase block">Highest Single Payment</span>
              <strong className="text-sm font-mono font-bold text-ledger-ink block mt-0.5 tabular-nums">
                {formatInr(data.largest[0]?.amountPaise || 0)}
              </strong>
              <small className="text-[10px] text-ledger-muted block mt-0.5 font-medium truncate">
                {data.largest[0]?.payeeName || 'No payments yet'}
              </small>
            </div>
          </section>

          {/* Lazy loaded ECharts Visualizations */}
          <React.Suspense
            fallback={
              <div className="py-16 text-center text-xs text-ledger-muted font-semibold bg-white border border-ledger-border rounded-xl">
                Loading ECharts dynamic visualization engine...
              </div>
            }
          >
            {/* Fallback layout for exactly 1 daily active data bucket */}
            {data.daily.length === 1 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
                <div className="ledger-card border-ledger-border bg-white flex flex-col justify-between p-4 min-h-[300px]">
                  <div>
                    <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                      Daily Trend (Single active day)
                    </h3>
                    <p className="text-[10px] text-ledger-muted">A trend chart needs at least two days with payments.</p>
                  </div>
                  <div className="flex-1 flex flex-col justify-center space-y-4 max-w-sm mx-auto text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>Cash</span>
                        <span className="font-mono">{formatInr(data.daily[0]?.cashPaise || 0)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Digital</span>
                        <span className="font-mono">{formatInr(data.daily[0]?.nonCashPaise || 0)}</span>
                      </div>
                    </div>
                    {/* Visual segment progress */}
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-ledger-border">
                      <div
                        style={{
                          width: `${
                            ((data.daily[0]?.cashPaise || 0) /
                              ((data.daily[0]?.cashPaise || 0) + (data.daily[0]?.nonCashPaise || 0) || 1)) *
                            100
                          }%`
                        }}
                        className="bg-amber-100 h-full"
                      />
                      <div
                        style={{
                          width: `${
                            ((data.daily[0]?.nonCashPaise || 0) /
                              ((data.daily[0]?.cashPaise || 0) + (data.daily[0]?.nonCashPaise || 0) || 1)) *
                            100
                          }%`
                        }}
                        className="bg-ledger-blue h-full"
                      />
                    </div>
                    <span className="text-[10px] text-ledger-muted text-center block">
                      {data.daily[0]?.label} · {formatInr((data.daily[0]?.cashPaise || 0) + (data.daily[0]?.nonCashPaise || 0))} total
                    </span>
                  </div>
                </div>

                <div className="ledger-card border-ledger-border bg-white flex flex-col justify-between p-4 min-h-[300px]">
                  <div>
                    <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                      Category Breakdown
                    </h3>
                    <p className="text-[10px] text-ledger-muted font-medium">Spending distribution shares</p>
                  </div>
                  <div className="flex-1 flex items-center justify-center text-xs text-ledger-muted italic">
                    Loading category chart share...
                  </div>
                </div>
              </div>
            ) : (
              <ReportCharts daily={data.daily} categories={data.categories} />
            )}
          </React.Suspense>

          {/* Category performance table */}
          <section className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
            <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
              <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                Category performance
              </h2>
              <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">
                Totals, averages, and active usages
              </p>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-ledger-border bg-ledger-workspace/10 text-ledger-muted font-semibold">
                    <th className="py-2.5 px-4 font-semibold w-[35%]">Category</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[15%]">Total</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[12%]">Payments</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[15%]">Avg payment</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[15%]">Avg active day</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[8%]">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-border/40">
                  {data.categories.map((row, idx) => (
                    <tr key={row.label} className="hover:bg-ledger-selection/20 transition-colors">
                      <td className="py-3.5 px-4">
                        <strong className="text-ledger-ink font-semibold">{row.label}</strong>
                        {/* Colored tiny horizontal visual reference bar */}
                        <div className="w-full bg-ledger-workspace h-1 rounded-full overflow-hidden mt-1.5">
                          <div
                            style={{
                              width: `${data.totals.totalPaise ? (row.totalPaise / data.totals.totalPaise) * 100 : 0}%`,
                              backgroundColor: categoryColors[idx % categoryColors.length]
                            }}
                            className="h-full rounded-full"
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-ledger-ink tabular-nums">
                        {formatInr(row.totalPaise)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-ledger-muted tabular-nums">
                        {row.paymentCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-ledger-muted tabular-nums">
                        {formatInr(row.averageTransactionPaise ?? 0)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-ledger-muted tabular-nums">
                        {formatInr(row.averageActiveDayPaise ?? 0)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-ledger-ink tabular-nums">
                        {data.totals.totalPaise
                          ? ((row.totalPaise / data.totals.totalPaise) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                  {data.categories.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 px-6 text-center text-ledger-muted italic">
                        No category data in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Methods and top payees */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <article className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
              <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
                <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Payment Methods
                </h2>
                <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">Volume and average payment size</p>
              </header>
              <div className="divide-y divide-ledger-border/40">
                {data.methods.map((row) => (
                  <div key={row.label} className="p-4 flex justify-between items-center gap-4">
                    <div>
                      <strong className="text-sm font-semibold text-ledger-ink leading-tight block">
                        {row.label}
                      </strong>
                      <span className="text-[10px] text-ledger-muted mt-0.5 block font-medium">
                        {row.paymentCount} payments · avg {formatInr(row.averageTransactionPaise ?? 0)}
                      </span>
                    </div>
                    <strong className="font-mono text-xs font-bold text-ledger-ink tabular-nums">
                      {formatInr(row.totalPaise)}
                    </strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
              <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
                <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Top Payees
                </h2>
                <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">Highest total outgoings in range</p>
              </header>
              <div className="divide-y divide-ledger-border/40">
                {data.payees.slice(0, 8).map((row) => (
                  <div key={row.label} className="p-4 flex justify-between items-center gap-4">
                    <div>
                      <strong className="text-sm font-semibold text-ledger-ink leading-tight block">
                        {row.label}
                      </strong>
                      <span className="text-[10px] text-ledger-muted mt-0.5 block font-medium uppercase">
                        {row.paymentCount} payments · {row.type}
                      </span>
                    </div>
                    <strong className="font-mono text-xs font-bold text-ledger-ink tabular-nums">
                      {formatInr(row.totalPaise)}
                    </strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          {/* Three lists (actionable/repetition) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Largest payments */}
            <article className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
              <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
                <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Largest Payments
                </h2>
                <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">Click to inspect notes and history</p>
              </header>
              <div className="divide-y divide-ledger-border/40">
                {data.largest.slice(0, 10).map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedTxId(row.id)}
                    className="w-full text-left p-3.5 flex justify-between items-center gap-4 hover:bg-ledger-selection/20 transition-colors"
                  >
                    <div className="overflow-hidden">
                      <strong className="text-xs font-semibold text-ledger-ink leading-tight block truncate">
                        {row.payeeName}
                      </strong>
                      <span className="text-[10px] text-ledger-muted mt-0.5 block truncate">
                        {row.transactionDate} · {row.note || 'No note'}
                      </span>
                    </div>
                    <b className="font-mono text-xs font-bold text-ledger-ink shrink-0 tabular-nums">
                      {formatInr(row.amountPaise)}
                    </b>
                  </button>
                ))}
              </div>
            </article>

            {/* Repeated amounts */}
            <article className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
              <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
                <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Repeated Amounts
                </h2>
                <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">Identical payee and transaction value</p>
              </header>
              <div className="divide-y divide-ledger-border/40">
                {data.repeated.slice(0, 10).map((row, idx) => (
                  <div key={idx} className="p-3.5 flex justify-between items-center gap-4">
                    <div>
                      <strong className="text-xs font-semibold text-ledger-ink leading-tight block">
                        {row.payeeName}
                      </strong>
                      <span className="text-[10px] text-ledger-muted mt-0.5 block font-medium">
                        {row.occurrences} occurrences
                      </span>
                    </div>
                    <b className="font-mono text-xs font-bold text-ledger-ink shrink-0 tabular-nums">
                      {formatInr(row.amountPaise)}
                    </b>
                  </div>
                ))}
              </div>
            </article>

            {/* Unusually high */}
            <article className="ledger-card p-0 overflow-hidden border-ledger-border bg-white shadow-sm">
              <header className="px-5 py-4 border-b border-ledger-border bg-ledger-workspace/30">
                <h2 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Unusually High
                </h2>
                <p className="text-[10px] text-ledger-muted mt-0.5 font-medium">At least twice payee's typical average</p>
              </header>
              <div className="divide-y divide-ledger-border/40">
                {data.unusual.slice(0, 10).map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedTxId(row.id)}
                    className="w-full text-left p-3.5 flex justify-between items-center gap-4 hover:bg-ledger-selection/20 transition-colors"
                  >
                    <div className="overflow-hidden">
                      <strong className="text-xs font-semibold text-ledger-ink leading-tight block truncate">
                        {row.payeeName}
                      </strong>
                      <span className="text-[10px] text-ledger-muted mt-0.5 block truncate">
                        {row.transactionDate} · usual avg {formatInr(row.averagePaise ?? 0)}
                      </span>
                    </div>
                    <b className="font-mono text-xs font-bold text-ledger-ink shrink-0 tabular-nums">
                      {formatInr(row.amountPaise)}
                    </b>
                  </button>
                ))}
              </div>
            </article>
          </section>

          {/* manual backup section */}
          <section className="ledger-card border-ledger-border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-ledger-muted tracking-wider">
                Reliability
              </p>
              <h2 className="text-sm font-bold text-ledger-ink uppercase tracking-wider mt-1">
                Verified manual backup
              </h2>
              <p className="text-xs text-ledger-muted mt-1 leading-normal">
                Create an online SQLite database backup snapshot on the local disk without stopping the application.
              </p>
              {backupMessage && (
                <strong className="block text-xs text-emerald-700 mt-2 font-semibold">
                  {backupMessage}
                </strong>
              )}
            </div>
            <button onClick={handleBackup} className="btn btn-primary text-xs py-2 px-5 shrink-0 hover:shadow-sm">
              Create verified backup
            </button>
          </section>
        </>
      )}

      {/* Transaction Inspection Drawer */}
      <TransactionDetailDrawer
        open={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
        transactionId={selectedTxId}
      />
    </div>
  );
}
