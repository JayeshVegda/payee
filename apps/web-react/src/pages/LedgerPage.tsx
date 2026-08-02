import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  patch,
  post,
  formatInr,
  formatTime12,
  rupeesToPaise,
  queryString,
  LedgerTransaction,
  MasterData,
  TransactionPage
} from '../api/client';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
  SortingState
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, X, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuditEntry {
  id: number;
  action: string;
  changedAt: string;
  changeSource: string;
}

export default function LedgerPage() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const today = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Filter States
  const [savedView, setSavedView] = useState<'today' | 'review' | 'voided' | 'month' | 'all'>('today');
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [includeVoided, setIncludeVoided] = useState(false);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'transactionTime', desc: true }]);

  // Active Selected Transaction for Drawer Edit
  const [selectedTx, setSelectedTx] = useState<LedgerTransaction | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [txDate, setTxDate] = useState('');
  const [txTime, setTxTime] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txMethod, setTxMethod] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txReview, setTxReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState('');

  // Key-based row selection state for keyboard navigation (index of the row in the table)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

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
    if (transactionId) {
      const idNum = Number(transactionId);
      const found = items.find((item) => item.id === idNum);
      if (found) {
        openTx(found);
      } else {
        // Load details via API if not in the current list
        api<LedgerTransaction>(`/transactions/${idNum}`)
          .then((loaded) => openTx(loaded))
          .catch(() => {
            toast.error('Transaction not found');
            navigate(`/ledger${location.search}`);
          });
      }
    } else {
      setSelectedTx(null);
    }
  }, [transactionId, items]);

  const openTx = async (item: LedgerTransaction) => {
    setSelectedTx(item);
    setTxDate(item.transactionDate);
    setTxTime(item.transactionTime.slice(0, 5));
    setTxAmount((item.amountPaise / 100).toFixed(item.amountPaise % 100 ? 2 : 0));
    setTxCategory(item.categoryId?.toString() || '');
    setTxMethod(item.paymentMethodId?.toString() || '');
    setTxNote(item.note || '');
    setTxReview(item.needsReview);
    setDrawerError('');
    try {
      const history = await api<AuditEntry[]>(`/transactions/${item.id}/audit`);
      setAudit(history);
    } catch {
      setAudit([]);
    }
  };

  const handleCloseDrawer = () => {
    navigate(`/ledger${location.search}`);
  };

  const applyView = (view: typeof savedView) => {
    setSavedView(view);
    setReviewOnly(view === 'review');
    setIncludeVoided(view === 'voided');
    setPage(1);
    setFocusedRowIndex(null);
    if (view === 'today' || view === 'review' || view === 'voided') {
      setDate(today);
    } else {
      setDate('');
    }
  };

  const saveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;
    const amountPaise = rupeesToPaise(txAmount);
    if (!amountPaise) {
      setDrawerError('Enter a valid positive rupee amount with at most two decimals.');
      return;
    }
    setSaving(true);
    setDrawerError('');
    try {
      await patch(`/transactions/${selectedTx.id}`, {
        transactionDate: txDate,
        transactionTime: `${txTime}:00`,
        amountPaise,
        categoryId: txCategory ? Number(txCategory) : null,
        paymentMethodId: txMethod ? Number(txMethod) : null,
        note: txNote || null,
        needsReview: txReview,
        expectedUpdatedAt: selectedTx.updatedAt,
        source: 'web'
      });
      toast.success('Correction saved with audit record.');
      refetchTransactions();
      handleCloseDrawer();
    } catch (caught) {
      setDrawerError(caught instanceof Error ? caught.message : 'Correction could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const voidSelected = async () => {
    if (!selectedTx) return;
    const reason = window.prompt('Reason for voiding this payment:');
    if (!reason) return;
    setSaving(true);
    try {
      await post(`/transactions/${selectedTx.id}/void`, { reason });
      toast.success('Payment voided successfully.');
      refetchTransactions();
      handleCloseDrawer();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Payment could not be voided');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation inside page table
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isTyping) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(items.length - 1, prev + 1);
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(0, prev - 1);
        });
      } else if (e.key === 'Enter' && focusedRowIndex !== null) {
        const item = items[focusedRowIndex];
        if (item) {
          e.preventDefault();
          navigate(`/ledger/${item.id}${location.search}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [items, focusedRowIndex, navigate, location]);

  // TanStack Table columns def
  const tableColumns = useMemo<ColumnDef<LedgerTransaction>[]>(
    () => [
      {
        accessorKey: 'transactionTime',
        header: 'Time',
        cell: (info) => formatTime12(info.getValue() as string)
      },
      {
        accessorKey: 'payeeName',
        header: 'Payee',
        cell: (info) => {
          const tx = info.row.original;
          return (
            <div className="flex items-center gap-2">
              <strong className="font-semibold text-ledger-ink">{tx.payeeName}</strong>
              {tx.status === 'voided' && (
                <span className="px-1.5 py-0.5 text-[9px] uppercase font-extrabold bg-red-100 text-red-700 rounded border border-red-200">
                  Voided
                </span>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'categoryName',
        header: 'Category',
        cell: (info) => info.getValue() as string || '—'
      },
      {
        accessorKey: 'paymentMethodName',
        header: 'Method',
        cell: (info) => info.getValue() as string || '—'
      },
      {
        accessorKey: 'note',
        header: 'Note',
        cell: (info) => (
          <span className="truncate block max-w-[240px]" title={info.getValue() as string}>
            {info.getValue() as string || '—'}
          </span>
        )
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: (info) => <span className="uppercase text-[10px] bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded font-medium">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'amountPaise',
        header: 'Amount',
        cell: (info) => (
          <span className="font-mono font-semibold tabular-nums text-ledger-ink">
            {formatInr(info.getValue() as number)}
          </span>
        )
      }
    ],
    []
  );

  const table = useReactTable({
    data: items,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink">
            Transaction Ledger
          </h1>
        </div>
        <a
          href={`/api/export/transactions.csv${queryString({
            from: date,
            to: date,
            includeVoided
          })}`}
          className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </a>
      </header>

      {/* Filter shell */}
      <section className="ledger-card p-4 border-ledger-border shadow-xs space-y-4 bg-white">
        {/* Saved Views Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-border/40 pb-3">
          <nav className="flex bg-ledger-workspace p-0.5 rounded-lg border border-ledger-border/80" aria-label="Ledger views">
            {(
              [
                ['today', 'Today'],
                ['review', 'Review Queue'],
                ['voided', 'With Voided'],
                ['month', 'This Month'],
                ['all', 'All Transactions']
              ] as const
            ).map(([vCode, vName]) => (
              <button
                key={vCode}
                onClick={() => applyView(vCode)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  savedView === vCode
                    ? 'bg-white text-ledger-blue shadow-xs'
                    : 'text-ledger-muted hover:text-ledger-ink'
                }`}
              >
                {vName}
              </button>
            ))}
          </nav>
        </div>

        {/* Input filters row */}
        <div className="flex flex-wrap gap-4 text-xs font-medium">
          <label className="flex flex-col gap-1.5 w-full sm:w-auto">
            <span className="text-ledger-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="form-input py-1.5 text-xs w-full sm:w-44"
            />
          </label>

          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-ledger-muted">Search payee or note</span>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ledger-muted/80 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Type and press Enter to filter..."
                className="form-input py-1.5 pl-9 text-xs"
              />
            </div>
          </label>
        </div>
      </section>

      {/* Main Ledger Table */}
      <section className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-ledger-border/80 bg-ledger-workspace/30 text-ledger-muted font-semibold">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="py-2.5 px-4 font-semibold">
                      {header.isPlaceholder ? null : (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 hover:text-ledger-ink select-none font-semibold text-xs"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="w-3 h-3 text-ledger-muted/65" />
                        </button>
                      )}
                    </th>
                  ))}
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-ledger-border/40">
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/ledger/${item.id}${location.search}`)}
                  className={`hover:bg-ledger-selection/30 cursor-pointer transition-colors ${
                    item.status === 'voided' ? 'opacity-55' : ''
                  } ${
                    item.needsReview && item.status === 'posted' ? 'bg-ledger-review/5' : ''
                  } ${idx === focusedRowIndex ? 'bg-ledger-selection border-y-2 border-ledger-blue' : ''}`}
                >
                  <td className="py-3 px-4 font-mono text-ledger-muted tabular-nums">
                    {formatTime12(item.transactionTime)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-ledger-ink">
                    <div className="flex items-center gap-2">
                      {item.payeeName}
                      {item.status === 'voided' && (
                        <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-red-50 text-red-700 rounded border border-red-200">
                          Voided
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-ledger-ink">{item.categoryName || '—'}</td>
                  <td className="py-3 px-4 text-ledger-muted uppercase text-[11px] font-medium">
                    {item.paymentMethodName || '—'}
                  </td>
                  <td className="py-3 px-4 text-ledger-muted truncate max-w-[240px]">
                    {item.note || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="uppercase text-[9px] font-bold bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded text-ledger-muted">
                      {item.source}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold tabular-nums text-ledger-ink text-sm">
                    {formatInr(item.amountPaise)}
                  </td>
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/ledger/${item.id}${location.search}`)}
                      className="px-2.5 py-1 text-[11px] font-semibold border border-ledger-border hover:border-ledger-blue hover:text-ledger-blue rounded bg-white transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-6 text-center text-ledger-muted italic">
                    No transactions match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {items.length > 0 && (
          <footer className="px-5 py-3 border-t border-ledger-border bg-ledger-workspace/30 flex justify-between items-center text-xs text-ledger-muted font-medium">
            <span>
              Page {result?.page} of {totalPages} ({result?.total} items)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary text-xs py-1 px-3"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary text-xs py-1 px-3"
              >
                Next
              </button>
            </div>
          </footer>
        )}
      </section>

      {/* Edit transaction Details Drawer */}
      {selectedTx && master && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40" onClick={handleCloseDrawer} />

          {/* Drawer content panel */}
          <div className="relative w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col z-10 border-l border-ledger-border animate-in slide-in-from-right duration-200">
            <header className="flex items-center justify-between px-6 py-4 border-b border-ledger-border">
              <div>
                <span className="text-[10px] uppercase font-bold text-ledger-muted tracking-wider">
                  Transaction #{selectedTx.id}
                </span>
                <h2 className="text-lg font-bold text-ledger-ink leading-tight">
                  {selectedTx.payeeName}
                </h2>
                <p className="text-xs text-ledger-muted mt-0.5">
                  Audit corrected or void this payment
                </p>
              </div>
              <button
                onClick={handleCloseDrawer}
                className="p-1.5 rounded-md hover:bg-ledger-selection text-ledger-muted hover:text-ledger-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <form onSubmit={saveCorrection} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold text-ledger-muted">
              {drawerError && (
                <div className="p-3 bg-ledger-review/10 border border-ledger-review/20 text-ledger-review rounded-md">
                  {drawerError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="form-input"
                    disabled={selectedTx.status === 'voided'}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Time</label>
                  <input
                    type="time"
                    value={txTime}
                    onChange={(e) => setTxTime(e.target.value)}
                    className="form-input"
                    disabled={selectedTx.status === 'voided'}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Amount in Rupees (₹)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="form-input font-mono"
                  disabled={selectedTx.status === 'voided'}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Category</label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="form-input"
                  disabled={selectedTx.status === 'voided'}
                >
                  <option value="">Not selected</option>
                  {master.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Payment Method</label>
                <select
                  value={txMethod}
                  onChange={(e) => setTxMethod(e.target.value)}
                  className="form-input"
                  disabled={selectedTx.status === 'voided'}
                >
                  <option value="">Not selected</option>
                  {master.paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-muted block">Purpose or note</label>
                <textarea
                  rows={2}
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className="form-input resize-none"
                  disabled={selectedTx.status === 'voided'}
                />
              </div>

              <div className="pt-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-ledger-ink">
                  <input
                    type="checkbox"
                    checked={txReview}
                    onChange={(e) => setTxReview(e.target.checked)}
                    className="rounded border-ledger-border text-ledger-blue focus:ring-ledger-blue"
                    disabled={selectedTx.status === 'voided'}
                  />
                  <span>Keep in review queue</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-ledger-border/40">
                <button
                  type="submit"
                  disabled={saving || selectedTx.status === 'voided'}
                  className="btn btn-primary text-xs flex-1 py-2"
                >
                  Save correction
                </button>
                <button
                  type="button"
                  onClick={voidSelected}
                  disabled={saving || selectedTx.status === 'voided'}
                  className="btn btn-secondary border-red-200 text-ledger-review hover:bg-red-50 text-xs flex-1 py-2"
                >
                  Delete / Void
                </button>
              </div>

              <div className="space-y-3 pt-4 border-t border-ledger-border/40">
                <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
                  Audit History
                </h3>
                <div className="space-y-3 pl-1">
                  {audit.map((entry) => (
                    <div key={entry.id} className="flex gap-3 text-xs relative">
                      <div className="w-1.5 h-1.5 rounded-full bg-ledger-blue mt-1.5 shrink-0" />
                      <div className="space-y-0.5">
                        <strong className="text-ledger-ink font-semibold capitalize">{entry.action}</strong>
                        <div className="text-[10px] text-ledger-muted font-medium">
                          {new Date(entry.changedAt).toLocaleString('en-IN')} · {entry.changeSource}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
