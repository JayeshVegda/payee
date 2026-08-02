import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr, post, queryString } from '../api/client';
import { Download, RefreshCw, Calendar, Sparkles, TrendingUp, AlertTriangle, Layers } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Reports</h1>
          <p className="mt-1 text-sm text-[#667085]">Spending trends and breakdowns.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary h-10 px-3 text-[#667085] hover:text-[#111827]"
            title="Refresh reports"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleExportCsv}
            className="btn btn-secondary h-10 px-4 gap-2 text-slate-700"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Bar */}
      <div className="ledger-card p-4 bg-white border border-[#DDE3EC] rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">RANGE PRESETS:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setRangePreset('month')}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-[#E9F1FF] hover:text-[#165DFF]"
            >
              This Month
            </button>
            <button
              onClick={() => setRangePreset(30)}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-[#E9F1FF] hover:text-[#165DFF]"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setRangePreset('six-months')}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-[#E9F1FF] hover:text-[#165DFF]"
            >
              Last 6 Months
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="form-input text-xs w-36"
          />
          <span className="text-xs font-bold text-[#667085]">TO</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="form-input text-xs w-36"
          />
        </div>
      </div>

      {/* Hero Stat Grid (Section 4.5 Spec) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* TOTAL OUTGOING Hero Stat Card (32px number, red top border) */}
        <div className="md:col-span-2 ledger-card border-t-2 border-t-[#FF2638] bg-white p-6 flex flex-col justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              TOTAL OUTGOING ({from} TO {to})
            </span>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-black tabular-nums text-[#111827]">
                {formatInr(totals.totalPaise)}
              </span>
              <span className="text-xs font-semibold text-[#667085]">
                across {totals.paymentCount} payments
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#DDE3EC] flex items-center justify-between text-xs text-[#667085]">
            <span>Active Days: <strong className="text-[#111827]">{totals.activeDayCount}</strong></span>
            <span>Unique Payees: <strong className="text-[#111827]">{totals.payeeCount}</strong></span>
          </div>
        </div>

        {/* Avg Transaction Stat */}
        <div className="ledger-card bg-white p-6 flex flex-col justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              AVG PAYMENT SIZE
            </span>
            <div className="mt-2">
              <span className="text-2xl font-bold tabular-nums text-[#111827]">
                {formatInr(totals.averageTransactionPaise)}
              </span>
            </div>
          </div>
          <p className="text-xs text-[#667085] mt-3">Per single ledger entry</p>
        </div>

        {/* Total Payments Count */}
        <div className="ledger-card bg-white p-6 flex flex-col justify-between shadow-xs">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              PAYMENT COUNT
            </span>
            <div className="mt-2">
              <span className="text-2xl font-bold tabular-nums text-[#111827]">
                {totals.paymentCount}
              </span>
            </div>
          </div>
          <p className="text-xs text-[#667085] mt-3">Recorded entries in period</p>
        </div>
      </div>

      {/* Interactive ECharts Visual Breakdown */}
      {data && (
        <React.Suspense fallback={<div className="h-64 bg-white rounded-2xl animate-pulse" />}>
          <ReportCharts daily={data.daily} categories={data.categories} />
        </React.Suspense>
      )}

      {/* Proportional Bars Breakdown for Categories & Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories Proportional Bars */}
        <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs space-y-4">
          <h3 className="text-base font-bold text-[#111827]">Category Performance</h3>
          <div className="space-y-3">
            {data?.categories.slice(0, 6).map((cat, idx) => {
              const pct = Math.round((cat.totalPaise / maxCategoryPaise) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#111827]">{cat.label}</span>
                    <span className="tabular-nums font-bold text-[#111827]">{formatInr(cat.totalPaise)}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#165DFF] h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Methods Proportional Bars */}
        <div className="ledger-card bg-white p-6 border border-[#DDE3EC] rounded-2xl shadow-xs space-y-4">
          <h3 className="text-base font-bold text-[#111827]">Payment Methods</h3>
          <div className="space-y-3">
            {data?.methods.map((method, idx) => {
              const pct = Math.round((method.totalPaise / maxMethodPaise) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#111827]">{method.label}</span>
                    <span className="tabular-nums font-bold text-[#111827]">{formatInr(method.totalPaise)}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#00B96B] h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Insights Section (Section 4.5 Spec: Amber icon/header treatment for Unusually High & Repeated) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Unusually High Card */}
        <div className="ledger-card bg-white p-6 border-t-2 border-t-[#F79009] border-[#DDE3EC] rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-[#F79009]">
            <AlertTriangle size={20} />
            <h3 className="text-base font-bold text-[#111827]">Unusually High Transactions</h3>
          </div>

          <div className="space-y-3">
            {!data?.unusual || data.unusual.length === 0 ? (
              <p className="text-xs text-[#667085]">No unusual payment anomalies detected in this period.</p>
            ) : (
              data.unusual.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedTx(item)}
                  className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl flex items-center justify-between cursor-pointer hover:bg-amber-100/50 transition-colors"
                >
                  <div>
                    <span className="font-bold text-sm text-[#111827] block">{item.payeeName}</span>
                    <span className="text-xs text-[#667085]">{item.transactionDate}</span>
                  </div>
                  <span className="tabular-nums font-black text-rose-600 text-base">
                    {formatInr(item.amountPaise)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Repeated Amounts Card */}
        <div className="ledger-card bg-white p-6 border-t-2 border-t-[#F79009] border-[#DDE3EC] rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-[#F79009]">
            <Sparkles size={20} />
            <h3 className="text-base font-bold text-[#111827]">Repeated Amount Patterns</h3>
          </div>

          <div className="space-y-3">
            {!data?.repeated || data.repeated.length === 0 ? (
              <p className="text-xs text-[#667085]">No repeated payment patterns detected.</p>
            ) : (
              data.repeated.slice(0, 4).map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-[#111827] block">{item.payeeName}</span>
                    <span className="text-xs text-[#667085]">Repeated {item.occurrences} times</span>
                  </div>
                  <span className="tabular-nums font-bold text-[#111827]">
                    {formatInr(item.amountPaise)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <TransactionDrawer
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
