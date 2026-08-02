import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  api,
  post,
  formatInr,
  formatTime12,
  DashboardData,
  MasterData,
  QuickPreview,
  LedgerTransaction,
  Payee
} from '../api/client';
import Fuse from 'fuse.js';
import {
  RefreshCw,
  ListPlus,
  FileText,
  CheckCircle2,
  Search,
  ArrowRight,
  Banknote,
  Clock,
  TrendingUp,
  Inbox,
  CreditCard,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import DetailedEntryDrawer from '../components/payment-entry/DetailedEntryDrawer';
import BatchEntryModal from '../components/payment-entry/BatchEntryModal';
import QuickReviewModal from '../components/review/QuickReviewModal';
import TransactionDetailDrawer from '../components/transactions/TransactionDetailDrawer';

export default function TodayPage() {
  const [command, setCommand] = useState('');
  const [preview, setPreview] = useState<QuickPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [newPayeeConfirmed, setNewPayeeConfirmed] = useState(false);

  const [detailedOpen, setDetailedOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);
  const [reviewTransaction, setReviewTransaction] = useState<{
    id: number;
    updatedAt: string;
    amountPaise?: number;
    payeeName?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const previewTimerRef = useRef<number | undefined>(undefined);

  // Queries
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    refetch: refetchDashboard
  } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard')
  });

  const { data: master, refetch: refetchMaster } = useQuery<MasterData>({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data')
  });

  const todayDate = dashboard?.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    refetch: refetchTransactions
  } = useQuery<{ items: LedgerTransaction[] }>({
    queryKey: ['transactions', todayDate],
    queryFn: () => api<{ items: LedgerTransaction[] }>(`/transactions?date=${todayDate}&pageSize=100`),
    enabled: !!todayDate
  });

  const todaysItems = transactionsData?.items || [];
  const loading = dashboardLoading || transactionsLoading;

  const handleRefresh = async () => {
    await Promise.all([refetchDashboard(), refetchMaster(), refetchTransactions()]);
    toast.success('Today data refreshed');
  };

  // Suggestion list derivation with deterministic payee ranking
  const commandPayeeSuggestions = React.useMemo(() => {
    const trimmed = command.trim();
    if (!trimmed || !master?.payees) return [];
    
    // Extract payee term before amount/number
    const amountStart = trimmed.search(/\s+(?=(?:₹|rs\.?\s*)?\d)/i);
    const term = (amountStart >= 0 ? trimmed.slice(0, amountStart) : trimmed).trim();
    if (term.length < 1) return [];

    const norm = term.toLowerCase();

    // Exact matches or exact lowercase matches bypass suggestions
    if (master.payees.some((p) => p.name.toLowerCase() === norm)) {
      return [];
    }

    const seenIds = new Set<number>();
    const results: Payee[] = [];

    const addUnique = (item: Payee) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        results.push(item);
      }
    };

    // 1. Exact alias match (case-insensitive)
    for (const payee of master.payees) {
      if (payee.aliases.some((alias) => alias.toLowerCase() === norm)) {
        addUnique(payee);
      }
    }

    // 2. Exact name match (case-insensitive)
    for (const payee of master.payees) {
      if (payee.name.toLowerCase() === norm) {
        addUnique(payee);
      }
    }

    // 3. Prefix match (starts with trimmed term)
    for (const payee of master.payees) {
      if (payee.name.toLowerCase().startsWith(norm)) {
        addUnique(payee);
      }
      for (const alias of payee.aliases) {
        if (alias.toLowerCase().startsWith(norm)) {
          addUnique(payee);
        }
      }
    }

    // 4. Word prefix match (any word starts with trimmed term)
    for (const payee of master.payees) {
      const nameWords = payee.name.toLowerCase().split(/\s+/);
      if (nameWords.some((word) => word.startsWith(norm))) {
        addUnique(payee);
      }
      for (const alias of payee.aliases) {
        const aliasWords = alias.toLowerCase().split(/\s+/);
        if (aliasWords.some((word) => word.startsWith(norm))) {
          addUnique(payee);
        }
      }
    }

    // 5. Contains match (sub-string contains trimmed term)
    for (const payee of master.payees) {
      if (payee.name.toLowerCase().includes(norm)) {
        addUnique(payee);
      }
      for (const alias of payee.aliases) {
        if (alias.toLowerCase().includes(norm)) {
          addUnique(payee);
        }
      }
    }

    // If we have matches, return them (up to 6)
    if (results.length > 0) {
      return results.slice(0, 6);
    }

    // 6. Fuzzy fallback match (Fuse.js)
    return new Fuse(master.payees, {
      keys: ['name', 'aliases'],
      threshold: 0.32,
      includeScore: true
    })
      .search(term)
      .filter((res) => (res.score ?? 1) <= 0.32)
      .slice(0, 6)
      .map((res) => res.item);
  }, [command, master]);

  // Similar payees checks for warnings when new payee is proposed
  const similarPayees = React.useMemo(() => {
    if (!preview?.isNewPayee || !preview.payeeName || !master?.payees) return [];
    return new Fuse(master.payees, {
      keys: ['name', 'aliases'],
      threshold: 0.42,
      includeScore: true
    })
      .search(preview.payeeName)
      .filter((res) => (res.score ?? 1) < 0.42)
      .slice(0, 3)
      .map((res) => res.item);
  }, [preview, master]);

  // Trigger quick entry preview
  const updatePreview = (cmdVal: string) => {
    setNewPayeeConfirmed(false);
    setSuggestionIndex(0);
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    if (!cmdVal.trim()) {
      setPreview(null);
      return;
    }

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const previewResult = await post<QuickPreview>('/quick-entry/preview', {
          command: cmdVal
        });
        setPreview(previewResult);
      } catch (caught) {
        setPreview(null);
        toast.error(caught instanceof Error ? caught.message : 'Entry could not be parsed');
      }
    }, 130);
  };

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  const chooseCommandPayee = (payee: Payee) => {
    const trimmed = command.trim();
    const amountStart = trimmed.search(/\s+(?=(?:₹|rs\.?\s*)?\d)/i);
    const remainder = amountStart >= 0 ? trimmed.slice(amountStart).trim() : '';
    const newCmd = `${payee.name}${remainder ? ` ${remainder}` : ' '}`;
    setCommand(newCmd);
    updatePreview(newCmd);
    inputRef.current?.focus();
  };

  const handleCommandKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (commandPayeeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % commandPayeeSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(
          (prev) => (prev - 1 + commandPayeeSuggestions.length) % commandPayeeSuggestions.length
        );
        return;
      }
      if (e.key === 'Tab') {
        const payee = commandPayeeSuggestions[suggestionIndex];
        if (payee) {
          e.preventDefault();
          chooseCommandPayee(payee);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestionIndex(-1);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      void saveSmart();
    }
  };

  const saveSmart = async () => {
    if (
      !preview?.valid ||
      saving ||
      (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed)
    ) {
      return;
    }
    setSaving(true);
    try {
      const result = await post<{
        transaction: { id: number; updatedAt: string; needsReview: boolean };
        duplicate: boolean;
        duplicateReason: string | null;
        createdPayee: boolean;
      }>('/quick-entry/save', { command });

      toast.success(result.duplicate ? 'Payment saved — possible duplicate' : 'Payment saved', {
        description: result.createdPayee
          ? 'New payee created. Cash used by default.'
          : (result.duplicateReason ?? 'Stored locally with an audit record.')
      });

      setCommand('');
      setPreview(null);
      await Promise.all([refetchDashboard(), refetchTransactions()]);

      if (result.transaction.needsReview) {
        setReviewTransaction({
          id: result.transaction.id,
          updatedAt: result.transaction.updatedAt,
          amountPaise: preview.amountPaise ?? undefined,
          payeeName: preview.payeeName ?? undefined
        });
        setReviewOpen(true);
      }
      inputRef.current?.focus();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Payment could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const usePayee = (pName: string) => {
    const newCmd = `${pName} `;
    setCommand(newCmd);
    updatePreview(newCmd);
    inputRef.current?.focus();
  };

  const useSimilarPayee = (pName: string) => {
    if (!preview?.payeeName) return;
    const newCmd = command.replace(
      new RegExp(`^${preview.payeeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      pName
    );
    setCommand(newCmd);
    updatePreview(newCmd);
  };

  // Operational stats calculations
  const uniquePayees = new Set(todaysItems.map((item) => item.payeeId)).size;
  const firstPaymentTime = todaysItems.length > 0 ? formatTime12(todaysItems[todaysItems.length - 1]!.transactionTime) : '—';
  const latestPaymentTime = todaysItems.length > 0 ? formatTime12(todaysItems[0]!.transactionTime) : '—';
  const averagePayment = todaysItems.length > 0
    ? Math.round(todaysItems.reduce((sum, item) => sum + item.amountPaise, 0) / todaysItems.length)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Page Title & Action bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            Today
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Good morning, Operator. Record outlays, track cash distributions, and complete category reviews.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all cursor-pointer bg-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setBatchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all cursor-pointer bg-white"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Batch Entry
          </button>
          <button
            onClick={() => setDetailedOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-ledger-blue hover:bg-ledger-blue-hover text-white rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Detailed Form
          </button>
        </div>
      </header>

      {/* 2. Command Entry Box (MOVED TO TOP OF THE PAGE!) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
        <div className="flex items-center h-14 bg-white relative">
          <span className="w-12 h-full border-r border-slate-100 text-slate-400 flex items-center justify-center text-xl font-bold select-none bg-slate-50/50">
            ₹
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={commandPayeeSuggestions.length > 0}
            aria-controls="payee-listbox"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              updatePreview(e.target.value);
            }}
            onKeyDown={handleCommandKey}
            placeholder="Payee, amount, date, method, purpose..."
            className="flex-1 h-full px-4 text-[15px] font-bold tracking-tight text-slate-800 border-none outline-none focus:ring-0 focus:outline-none"
            autoComplete="off"
            autoFocus
          />
          <kbd className="mr-4 text-[9px] select-none uppercase font-extrabold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
            Enter
          </kbd>
        </div>

        {/* Suggestions drop-down matching aliases */}
        <AnimatePresence>
          {commandPayeeSuggestions.length > 0 && suggestionIndex >= 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              id="payee-listbox"
              role="listbox"
              aria-label="Payee matches"
              className="p-3 border-t border-slate-100 bg-slate-50/40 flex flex-col gap-2 overflow-hidden"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold px-1">
                <span>SUGGESTED ALIAS & NAME MATCHES</span>
                <span>
                  Use <kbd className="text-[9px]">↑↓</kbd> or <kbd className="text-[9px]">Tab</kbd> to select
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {commandPayeeSuggestions.map((payee, idx) => (
                  <div
                    key={payee.id}
                    role="option"
                    aria-selected={idx === suggestionIndex}
                    onClick={() => chooseCommandPayee(payee)}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                      idx === suggestionIndex
                        ? 'border-ledger-blue bg-white text-ledger-ink shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50/80 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-6 h-6 rounded bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                        {payee.name.slice(0, 2)}
                      </span>
                      <div className="truncate text-xs">
                        <strong className="text-slate-900 block font-bold truncate leading-normal">
                          {payee.name}
                        </strong>
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validation smart preview panel */}
        <div
          className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 ${
            preview && !preview.valid ? 'bg-red-50/10' : 'bg-slate-50/40'
          }`}
        >
          {preview ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex items-center justify-center w-5.5 h-5.5 rounded-full shrink-0 ${
                    preview.valid ? 'text-emerald-700 bg-emerald-100' : 'text-slate-400 bg-slate-100'
                  }`}
                >
                  {preview.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                </span>
                <div className="text-xs">
                  <span className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Parsed payment</span>
                  <strong className="text-slate-900 font-bold text-sm block mt-0.5">
                    {preview.payeeName || 'Choose payee'} ·{' '}
                    {preview.amountPaise ? formatInr(preview.amountPaise) : 'Amount missing'}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500 pl-8 font-semibold">
                <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                  {preview.paymentMethodName || 'Method required'}
                </span>
                <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                  {preview.categoryName || 'Category required'}
                </span>
                <span>
                  {preview.transactionDate || todayDate || 'Today'} ·{' '}
                  {preview.transactionTime ? formatTime12(preview.transactionTime) : 'Now'}
                </span>
                <span className="truncate max-w-[200px]" title={preview.note ?? ''}>
                  {preview.note || 'No purpose'}
                </span>
              </div>

              {preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed && (
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg pl-8 text-xs text-amber-900">
                  <strong className="font-bold block mb-1">Similar payees exist:</strong>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {similarPayees.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => useSimilarPayee(p.name)}
                        className="px-2 py-0.5 bg-white border border-amber-300 hover:border-amber-500 rounded text-[11px] text-amber-900 transition-colors cursor-pointer font-semibold"
                      >
                        Use {p.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setNewPayeeConfirmed(true)}
                      className="px-2 py-0.5 bg-amber-800 text-white rounded text-[11px] hover:bg-amber-900 transition-colors cursor-pointer font-bold"
                    >
                      Create “{preview.payeeName}” anyway
                    </button>
                  </div>
                </div>
              )}

              {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                <p className="text-[10px] text-rose-700 pl-8 mt-1 font-bold">
                  {[...preview.errors, ...preview.warnings].join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2.5 text-xs text-slate-500 py-1">
              <Banknote className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span>Type transaction details above to start quick recording.</span>
              </div>
            </div>
          )}

          {preview && (
            <button
              onClick={() => void saveSmart()}
              disabled={
                !preview.valid ||
                saving ||
                (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed)
              }
              className="btn btn-primary text-xs py-2 px-3 shrink-0 flex items-center gap-1 shadow-sm cursor-pointer"
            >
              {saving ? 'Saving...' : 'Post outlay'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick entry links row */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-1.5 bg-slate-50/20 border-t border-slate-100 select-none">
          <span className="text-[11px] font-bold text-slate-400 mr-2 uppercase tracking-wider">Quick payees</span>
          {master?.payees && master.payees.filter((p) => p.favourite || p.paymentCount > 0).length > 0 ? (
            master.payees
              .filter((p) => p.favourite || p.paymentCount > 0)
              .sort((a, b) => {
                if (a.favourite && !b.favourite) return -1;
                if (!a.favourite && b.favourite) return 1;
                return b.paymentCount - a.paymentCount;
              })
              .slice(0, 8)
              .map((payee) => (
                <button
                  key={payee.id}
                  onClick={() => usePayee(payee.name)}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-md border transition-all duration-100 cursor-pointer ${
                    payee.favourite
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-350 shadow-3xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-355'
                  }`}
                >
                  {payee.favourite && <span className="text-amber-500 mr-0.5">★</span>}
                  {payee.name}
                </button>
              ))
          ) : (
            <span className="text-[11px] text-slate-400 font-semibold">
              Frequent or favourite payees will appear here as quick entry links.
            </span>
          )}
        </div>
      </div>

      {/* 3. Soft Metrics Cards (Positioned under the entry station!) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" aria-label="Workstation totals">
        <article className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden group hover:border-ledger-blue/40 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-ledger-blue" />
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Outgoing</span>
            <TrendingUp className="w-4 h-4 text-ledger-blue" />
          </div>
          <strong className="text-2xl font-mono text-slate-900 tracking-tight mt-3 block tabular-nums">
            {formatInr(dashboard?.totalOutgoingPaise ?? 0)}
          </strong>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-3 text-[10px] text-slate-500 font-semibold">
            <span>Posted today</span>
            <span>{dashboard?.paymentCount ?? 0} payments</span>
          </div>
        </article>

        <article className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden group hover:border-amber-400 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Cash Ledger</span>
            <Banknote className="w-4 h-4 text-amber-55" />
          </div>
          <strong className="text-2xl font-mono text-slate-900 tracking-tight mt-3 block tabular-nums">
            {formatInr(dashboard?.cashPaise ?? 0)}
          </strong>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-3.5">
            <div
              style={{
                width: `${
                  dashboard?.totalOutgoingPaise
                    ? ((dashboard.cashPaise ?? 0) / dashboard.totalOutgoingPaise) * 100
                    : 0
                }%`
              }}
              className="bg-amber-500 h-full rounded-full"
            />
          </div>
        </article>

        <article className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden group hover:border-indigo-400 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Digital Ledger</span>
            <CreditCard className="w-4 h-4 text-indigo-500" />
          </div>
          <strong className="text-2xl font-mono text-slate-900 tracking-tight mt-3 block tabular-nums">
            {formatInr(dashboard?.digitalPaise ?? 0)}
          </strong>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-3.5">
            <div
              style={{
                width: `${
                  dashboard?.totalOutgoingPaise
                    ? ((dashboard.digitalPaise ?? 0) / dashboard.totalOutgoingPaise) * 100
                    : 0
                }%`
              }}
              className="bg-indigo-500 h-full rounded-full"
            />
          </div>
        </article>

        <article
          className={`border p-5 rounded-xl bg-white shadow-xs relative overflow-hidden transition-all ${
            dashboard?.reviewCount && dashboard.reviewCount > 0
              ? 'border-amber-300 ring-1 ring-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.04)]'
              : 'border-slate-200 hover:border-rose-400'
          }`}
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
          <div className="flex items-center justify-between text-slate-500">
            <span className={`text-xs font-bold uppercase tracking-wider ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : ''}`}>
              Pending Reviews
            </span>
            <Inbox className={`w-4 h-4 ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-600' : ''}`} />
          </div>
          <strong className={`text-2xl font-mono tracking-tight mt-3 block ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
            {dashboard?.reviewCount ?? 0}
          </strong>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-3 text-[10px] text-slate-500 font-semibold">
            <span>Requires category map</span>
            <span className={dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-700 font-bold' : ''}>
              {dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'Review Needed' : 'Clean'}
            </span>
          </div>
        </article>
      </section>

      {/* 4. Dashboard Table and Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Outlay list) */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Outlay Ledger
            </h2>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-white border border-slate-200 px-2 py-0.5 rounded-md">
              {todaysItems.length} entries
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {todaysItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold">
                      <th className="py-2.5 px-4 w-[16%] text-right font-bold">Amount</th>
                      <th className="py-2.5 px-4 w-[28%] font-bold">Payee</th>
                      <th className="py-2.5 px-4 w-[22%] font-bold">Category</th>
                      <th className="py-2.5 px-4 w-[12%] font-bold">Method</th>
                      <th className="py-2.5 px-4 w-[22%] font-bold">Purpose</th>
                      <th className="py-2.5 px-4 text-right font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todaysItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedTransaction(item)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-950 group-hover:text-ledger-blue tabular-nums">
                          {formatInr(item.amountPaise)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.payeeName}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold">
                          {item.categoryName || (
                            <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">
                              Review required
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-semibold uppercase font-mono text-[10px]">
                          {item.paymentMethodCode}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium truncate max-w-[150px]">
                          {item.note || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {item.needsReview ? (
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                              Review
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                              Posted
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 px-6 text-center space-y-3 text-slate-400">
                <Banknote className="w-7 h-7 mx-auto text-slate-300 bg-slate-50 p-1.5 rounded-full" />
                <strong className="block text-slate-800 font-bold text-sm">No transactions logged today</strong>
                <p className="text-xs">Use the quick entry command bar above to record your first ledger item.</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column (Desk Status) */}
        <section className="space-y-6">
          <div className="border-b border-slate-200/80 pb-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Desk Status
            </h2>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4.5 shadow-xs">
            <header className="border-b border-slate-100 pb-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">System Date</span>
              <strong className="text-base font-bold text-slate-900 block mt-0.5">
                {todayDate}
              </strong>
            </header>

            <dl className="grid grid-cols-2 gap-y-4 text-xs font-semibold text-slate-500">
              <div>
                <dt className="font-bold text-slate-400 mb-0.5">First Entry</dt>
                <dd className="text-slate-800 font-mono font-bold">{firstPaymentTime}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-400 mb-0.5">Latest Entry</dt>
                <dd className="text-slate-800 font-mono font-bold">{latestPaymentTime}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-400 mb-0.5">Payees Paid</dt>
                <dd className="text-slate-800 font-mono font-bold">{uniquePayees}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-400 mb-0.5">Avg Size</dt>
                <dd className="text-slate-800 font-mono font-bold tabular-nums">
                  {formatInr(averagePayment)}
                </dd>
              </div>
            </dl>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-500 font-semibold">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Helpful Reminders</span>
              </div>
              <p className="leading-relaxed">
                Click on any transaction logged today to show the audit logs drawer and correct or void details.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Drawers and modals components */}
      {master && (
        <>
          <DetailedEntryDrawer
            open={detailedOpen}
            onClose={() => setDetailedOpen(false)}
            master={master}
            onSaved={handleRefresh}
          />

          <BatchEntryModal
            open={batchOpen}
            onClose={() => setBatchOpen(false)}
            master={master}
            onSaved={handleRefresh}
          />

          <QuickReviewModal
            open={reviewOpen}
            onClose={() => {
              setReviewOpen(false);
              setReviewTransaction(null);
            }}
            master={master}
            transaction={reviewTransaction}
            onSaved={handleRefresh}
          />
        </>
      )}

      <TransactionDetailDrawer
        open={selectedTransaction !== null}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
      />
    </div>
  );
}
