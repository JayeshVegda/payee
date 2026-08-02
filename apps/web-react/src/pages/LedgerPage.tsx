import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  formatInr,
  formatTime12,
  queryString,
  LedgerTransaction,
  MasterData,
  TransactionPage
} from '../api/client';
import { Search, Download, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { SegmentedTabs } from '../components/common/SegmentedTabs';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { StatusPill } from '../components/common/StatusPill';
import { TransactionDrawer } from '../components/common/TransactionDrawer';

export default function LedgerPage() {
  const { transactionId } = useParams();
  const navigate = useNavigate();

  const today = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Filter States
  const [savedView, setSavedView] = useState<string>('today');
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [includeVoided, setIncludeVoided] = useState(false);
  const [page, setPage] = useState(1);

  // Selected Transaction for Drawer
  const [selectedTx, setSelectedTx] = useState<LedgerTransaction | null>(null);

  // Queries
  const { data: master } = useQuery<MasterData>({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data')
  });

  const { data: result, refetch: refetchTransactions } = useQuery<TransactionPage>({
    queryKey: ['ledger-transactions', date, search, reviewOnly, includeVoided, page, savedView],
    queryFn: () =>
      api<TransactionPage>(
        `/transactions${queryString({
          date: savedView === 'month' || savedView === 'all' ? undefined : date,
          from: savedView === 'month' ? `${today.slice(0, 8)}01` : undefined,
          search,
          reviewOnly,
          includeVoided,
          page,
          pageSize: 50
        })}`
      )
  });

  const items = result?.items || [];
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 50)));

  // Sync route param transactionId into selected transaction
  useEffect(() => {
    if (transactionId && items.length > 0) {
      const found = items.find((item) => item.id === Number(transactionId));
      if (found) {
        setSelectedTx(found);
      }
    }
  }, [transactionId, items]);

  // View tabs handling
  const handleViewChange = (viewId: string) => {
    setSavedView(viewId);
    setPage(1);
    if (viewId === 'today') {
      setDate(today);
      setReviewOnly(false);
      setIncludeVoided(false);
    } else if (viewId === 'review') {
      setReviewOnly(true);
      setIncludeVoided(false);
    } else if (viewId === 'voided') {
      setReviewOnly(false);
      setIncludeVoided(true);
    } else {
      setReviewOnly(false);
      setIncludeVoided(false);
    }
  };

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: 'review', label: 'Review Queue' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Transactions' },
    { id: 'voided', label: 'With Voided' },
  ];

  const handleExportCsv = () => {
    const params = queryString({
      date: savedView === 'month' || savedView === 'all' ? undefined : date,
      from: savedView === 'month' ? `${today.slice(0, 8)}01` : undefined,
      search,
      reviewOnly,
      includeVoided
    });
    window.open(`/api/export/transactions.csv${params}`, '_blank');
    toast.success('Downloading CSV export...');
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/40 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111827] font-sans">
            Transactions
          </h2>
          <p className="text-xs text-stone-500 mt-1 font-medium">Search, review and manage recorded payments.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* Segmented Control Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap select-none">
        <SegmentedTabs
          options={tabs}
          activeId={savedView}
          onChange={handleViewChange}
        />
      </div>

      {/* Combined Filter Bar (44px height inputs) */}
      <div className="bg-white p-4 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50 flex flex-col md:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            name="ledger-search"
            aria-label="Search ledger"
            autoComplete="off"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search payee, category, amount, or note…"
            className="w-full h-10 pl-10 pr-4 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-stone-400 placeholder:font-normal"
          />
        </div>

        {/* Date Selector */}
        {savedView !== 'month' && savedView !== 'all' && (
          <div className="w-full md:w-48">
            <input
              type="date"
              name="ledger-date"
              aria-label="Ledger date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3.5 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            />
          </div>
        )}
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50/70 border-b border-[#E5E7EB]/80 text-[10px] uppercase font-bold tracking-wider text-stone-400 h-11 select-none">
              <tr>
                <th className="py-3 px-5">Date & Time</th>
                <th className="py-3 px-5">Payee</th>
                <th className="py-3 px-5">Category</th>
                <th className="py-3 px-5">Method</th>
                <th className="py-3 px-5">Source</th>
                <th className="py-3 px-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100/50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-stone-400">
                    <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-sm text-stone-850">No transactions match your search</p>
                    <p className="text-xs text-stone-500 mt-1">Try adjusting your filters or date selection.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isDigital = item.paymentMethodCode?.toLowerCase() !== 'cash';
                  const isVoided = item.status === 'voided';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedTx(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedTx(item);
                        }
                      }}
                      tabIndex={0}
                      className={`clickable-table-row transition-colors duration-150 h-14 hover:bg-stone-50/40 outline-none ${
                        isVoided ? 'opacity-50 bg-red-50/10' : ''
                      }`}
                    >
                      {/* Date & Time */}
                      <td className="py-3.5 px-5 text-xs font-semibold text-stone-500 font-mono">
                        <div>{item.transactionDate}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">{formatTime12(item.transactionTime)}</div>
                      </td>

                      {/* Payee with Avatar */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <PayeeAvatar name={item.payeeName} size={28} />
                          <div>
                            <span className="font-bold text-stone-900 block">{item.payeeName}</span>
                            {item.note && (
                              <span className="text-[10px] text-stone-400 truncate max-w-[200px] block mt-0.5 font-medium">
                                {item.note}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3.5 px-5">
                        {item.categoryName ? (
                          <span className="px-2.5 py-1 text-xs font-medium bg-stone-100 text-stone-850 rounded-md">
                            {item.categoryName}
                          </span>
                        ) : (
                          <StatusPill variant="amber" label="Uncategorised" />
                        )}
                      </td>

                      {/* Method Badge */}
                      <td className="py-3.5 px-5">
                        {isDigital ? (
                          <span className="bg-blue-50 text-blue-800 rounded-md px-2 py-0.5 font-bold uppercase font-mono text-[9px] border border-blue-100">
                            {item.paymentMethodCode}
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-800 rounded-md px-2 py-0.5 font-bold uppercase font-mono text-[9px] border border-amber-100">
                            CASH
                          </span>
                        )}
                      </td>

                      {/* Muted 11px Monospace Source Badge */}
                      <td className="py-3.5 px-5">
                        <span className="px-2 py-0.5 font-mono text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200/60 rounded-md uppercase">
                          {item.source}
                        </span>
                      </td>

                      {/* Fixed Right-Aligned Amount Column */}
                      <td className="py-3.5 px-5 text-right font-black tabular-nums text-stone-950 text-base">
                        {isVoided && <span className="line-through text-rose-500 mr-2">{formatInr(item.amountPaise)}</span>}
                        {!isVoided && formatInr(item.amountPaise)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-[#E5E7EB]/50 bg-stone-50/70 flex items-center justify-between text-xs text-stone-500 font-semibold select-none">
          <span>
            Page <strong className="text-stone-900">{page}</strong> of <strong className="text-stone-900">{totalPages}</strong> ({result?.total || 0} items)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 bg-white hover:bg-stone-50 rounded-lg text-stone-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 bg-white hover:bg-stone-50 rounded-lg text-stone-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Detail Drawer */}
      {selectedTx && (
        <TransactionDrawer
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}
