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
import { Search, Download, CheckCircle2, AlertTriangle, Filter, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Transactions</h1>
          <p className="mt-1 text-sm text-[#667085]">Search, review and manage recorded payments.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="btn btn-secondary h-10 px-4 gap-2 text-slate-700"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Segmented Control Tabs (Section 4.2 Spec) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SegmentedTabs
          options={tabs}
          activeId={savedView}
          onChange={handleViewChange}
        />
      </div>

      {/* Combined Filter Bar (44px height inputs) */}
      <div className="ledger-card p-4 bg-white border border-[#DDE3EC] rounded-2xl shadow-xs flex flex-col md:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]" />
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
            className="form-input pl-10"
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
              className="form-input font-medium"
            />
          </div>
        )}
      </div>

      {/* Ledger Table Container */}
      <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F6F8FC] border-b border-[#DDE3EC] text-xs uppercase font-bold text-[#667085]">
              <tr>
                <th className="py-3.5 px-5">Date & Time</th>
                <th className="py-3.5 px-5">Payee</th>
                <th className="py-3.5 px-5">Category</th>
                <th className="py-3.5 px-5">Method</th>
                <th className="py-3.5 px-5">Source</th>
                <th className="py-3.5 px-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EC]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#667085]">
                    <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-base">No transactions match your search</p>
                    <p className="text-xs mt-1">Try adjusting your filters or date selection.</p>
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
                      className={`clickable-table-row transition-colors ${
                        isVoided ? 'opacity-50 bg-rose-50/20' : 'hover:bg-[#F6F8FC]'
                      }`}
                    >
                      {/* Date & Time */}
                      <td className="py-3.5 px-5 text-xs font-semibold text-[#667085]">
                        <div>{item.transactionDate}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{formatTime12(item.transactionTime)}</div>
                      </td>

                      {/* Payee with Avatar */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <PayeeAvatar name={item.payeeName} size={32} />
                          <div>
                            <span className="font-bold text-[#111827] block">{item.payeeName}</span>
                            {item.note && (
                              <span className="text-xs text-[#667085] truncate max-w-[200px] block">
                                {item.note}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category Badge (Amber pill if empty) */}
                      <td className="py-3.5 px-5">
                        {item.categoryName ? (
                          <span className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-800 rounded-md">
                            {item.categoryName}
                          </span>
                        ) : (
                          <StatusPill variant="amber" label="Uncategorised" />
                        )}
                      </td>

                      {/* Method Badge */}
                      <td className="py-3.5 px-5">
                        {isDigital ? (
                          <StatusPill variant="blue" label={item.paymentMethodName || 'Digital/Bank'} />
                        ) : (
                          <StatusPill variant="gray" label="Cash" />
                        )}
                      </td>

                      {/* Muted 11px Monospace Source Badge */}
                      <td className="py-3.5 px-5">
                        <span className="px-2 py-0.5 font-mono text-[11px] font-semibold text-[#667085] bg-slate-100 rounded border border-slate-200 uppercase">
                          {item.source}
                        </span>
                      </td>

                      {/* Fixed Right-Aligned Amount Column with 700 Weight & Tabular Nums */}
                      <td className="py-3.5 px-5 text-right font-black tabular-nums text-[#111827] text-base">
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
        <div className="p-4 border-t border-[#DDE3EC] bg-[#F6F8FC] flex items-center justify-between text-xs text-[#667085]">
          <span>
            Page <strong className="text-[#111827]">{page}</strong> of <strong className="text-[#111827]">{totalPages}</strong> ({result?.total || 0} items)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary h-8 px-3 text-xs"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary h-8 px-3 text-xs"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Detail Drawer */}
      <TransactionDrawer
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
