import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr, queryString } from '../api/client';
import { Download, RefreshCw, AlertTriangle, Sparkles, TrendingUp, BarChart3, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { TransactionDrawer } from '../components/common/TransactionDrawer';

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
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  // Fetch report data
  const {
    data,
    isLoading: loading,
    refetch
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
    if (days === 'month') {
      setFrom(`${today.slice(0, 8)}01`);
    } else {
      const start = new Date();
      if (days === 'six-months') {
        start.setMonth(start.getMonth() - 6);
      } else {
        start.setDate(start.getDate() - (days as number) + 1);
      }
      const localFrom = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(start);
      setFrom(localFrom);
    }
    setTo(today);
  };

  const handleExportCsv = () => {
    window.open(`/api/export/transactions.csv${queryString({ from, to })}`, '_blank');
    toast.success('Downloading report CSV...');
  };

  const totals = data?.totals || {
    totalPaise: 0,
    paymentCount: 0,
    payeeCount: 0,
    activeDayCount: 0,
    averageTransactionPaise: 0
  };

  const maxCategoryPaise = data?.categories?.[0]?.totalPaise || 1;
  const maxMethodPaise = data?.methods?.[0]?.totalPaise || 1;

  return (
    <div className="space-y-8">
      {/* 1. Page Title Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/40 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-sans">
            Reports & Analytics
          </h2>
          <p className="text-xs text-stone-500 mt-1 font-medium">Spending trends, category breakdowns, and audit insights.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
            title="Refresh reports"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* Date Range Selector Bar */}
      <div className="bg-white p-4 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Presets</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setRangePreset('month')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-blue-50 hover:text-[#2563EB] text-stone-600 transition-colors border-none cursor-pointer"
            >
              This Month
            </button>
            <button
              onClick={() => setRangePreset(30)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-blue-50 hover:text-[#2563EB] text-stone-600 transition-colors border-none cursor-pointer"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setRangePreset('six-months')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-blue-50 hover:text-[#2563EB] text-stone-600 transition-colors border-none cursor-pointer"
            >
              Last 6 Months
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-3 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all w-36"
          />
          <span className="text-[10px] font-bold text-stone-400 uppercase">TO</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-3 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all w-36"
          />
        </div>
      </div>

      {/* Hero Stat Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* TOTAL OUTGOING Hero Stat Card */}
        <article className="md:col-span-2 bg-white rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between min-h-[140px]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Total Outgoing</span>
              <strong className="text-3xl font-mono text-stone-900 tracking-tight block py-1.5 tabular-nums">
                {formatInr(totals.totalPaise)}
              </strong>
            </div>
            <span className="w-10 h-10 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-stone-100/60 pt-3.5 mt-3 text-[10px] text-stone-500 font-semibold">
            <span>Active Days: <strong className="text-stone-900">{totals.activeDayCount}</strong></span>
            <span>Unique Payees: <strong className="text-stone-900">{totals.payeeCount}</strong></span>
          </div>
        </article>

        {/* Avg Transaction Stat */}
        <article className="bg-white rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between min-h-[140px]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Avg Payment Size</span>
              <strong className="text-2xl font-mono text-stone-900 tracking-tight block py-1.5 tabular-nums">
                {formatInr(totals.averageTransactionPaise)}
              </strong>
            </div>
            <span className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </span>
          </div>
          <p className="text-[10px] text-stone-450 mt-3 font-semibold">Per single ledger entry</p>
        </article>

        {/* Total Payments Count */}
        <article className="bg-white rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between min-h-[140px]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Payment Count</span>
              <strong className="text-2xl font-mono text-stone-900 tracking-tight block py-1.5 tabular-nums">
                {totals.paymentCount}
              </strong>
            </div>
            <span className="w-10 h-10 rounded-full bg-amber-50 text-[#F79009] flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </span>
          </div>
          <p className="text-[10px] text-stone-450 mt-3 font-semibold">Recorded entries in period</p>
        </article>
      </section>

      {/* Interactive ECharts Visual Breakdown */}
      {data && (
        <section className="bg-white rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50 overflow-hidden">
          <React.Suspense fallback={<div className="h-64 bg-stone-50/50 rounded-lg animate-pulse" />}>
            <ReportCharts daily={data.daily} categories={data.categories} />
          </React.Suspense>
        </section>
      )}

      {/* Proportional Bars Breakdown for Categories & Methods */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Breakdowns">
        {/* Categories Proportional Bars */}
        <div className="bg-white p-6 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/50 space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">Category Performance</h3>
          <div className="space-y-3.5">
            {data?.categories.slice(0, 6).map((cat, idx) => {
              const pct = Math.round((cat.totalPaise / maxCategoryPaise) * 100);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-stone-850">{cat.label}</span>
                    <span className="tabular-nums font-bold text-stone-900">{formatInr(cat.totalPaise)}</span>
                  </div>
                  <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#2563EB] h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Methods Proportional Bars */}
        <div className="bg-white p-6 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/50 space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">Payment Methods</h3>
          <div className="space-y-3.5">
            {data?.methods.map((method, idx) => {
              const pct = Math.round((method.totalPaise / maxMethodPaise) * 100);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-stone-850">{method.label}</span>
                    <span className="tabular-nums font-bold text-stone-900">{formatInr(method.totalPaise)}</span>
                  </div>
                  <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Insights Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Insights & Patterns">
        {/* Unusually High Card */}
        <div className="bg-white p-6 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/50 space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">Unusually High Transactions</h3>
          </div>

          <div className="space-y-3 select-none">
            {!data?.unusual || data.unusual.length === 0 ? (
              <p className="text-xs text-stone-500 font-medium">No unusual payment anomalies detected in this period.</p>
            ) : (
              data.unusual.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedTx(item)}
                  className="p-3 bg-stone-50/50 border border-stone-100 rounded-lg flex items-center justify-between cursor-pointer hover:bg-stone-100/40 transition-colors duration-150"
                >
                  <div>
                    <span className="font-bold text-xs text-stone-900 block leading-tight">{item.payeeName}</span>
                    <span className="text-[10px] text-stone-400 font-semibold block mt-0.5">{item.transactionDate}</span>
                  </div>
                  <span className="tabular-nums font-black text-rose-600 text-sm">
                    {formatInr(item.amountPaise)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Repeated Amounts Card */}
        <div className="bg-white p-6 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-stone-100/50 space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">Repeated Amount Patterns</h3>
          </div>

          <div className="space-y-3 select-none">
            {!data?.repeated || data.repeated.length === 0 ? (
              <p className="text-xs text-stone-500 font-medium">No repeated payment patterns detected.</p>
            ) : (
              data.repeated.slice(0, 4).map((item, idx) => (
                <div key={idx} className="p-3 bg-stone-50/50 border border-stone-100 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-stone-900 block leading-tight">{item.payeeName}</span>
                    <span className="text-[10px] text-stone-450 font-semibold block mt-0.5">Repeated {item.occurrences} times</span>
                  </div>
                  <span className="tabular-nums font-bold text-stone-950 text-sm">
                    {formatInr(item.amountPaise)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Transaction drawer details modal */}
      {selectedTx && (
        <TransactionDrawer
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}
