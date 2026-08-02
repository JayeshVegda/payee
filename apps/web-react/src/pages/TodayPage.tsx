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
  HelpCircle,
  User,
  Tag,
  LayoutGrid
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
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

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

  // Frontend debounced duplicate detection (logged within last 5 minutes)
  const isPossibleDuplicate = React.useMemo(() => {
    if (!preview?.valid || todaysItems.length === 0) return false;
    const latest = todaysItems[0]!;
    
    const payeeMatch = preview.payeeName?.toLowerCase() === latest.payeeName?.toLowerCase();
    const amountMatch = preview.amountPaise === latest.amountPaise;
    const methodMatch = preview.paymentMethodId === latest.paymentMethodId;
    const categoryMatch = preview.categoryId === latest.categoryId;

    return payeeMatch && amountMatch && methodMatch && categoryMatch;
  }, [preview, todaysItems]);

  // Trigger quick entry preview
  const updatePreview = (cmdVal: string) => {
    setNewPayeeConfirmed(false);
    setDuplicateConfirmed(false);
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
      (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed) ||
      (isPossibleDuplicate && !duplicateConfirmed)
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
      setDuplicateConfirmed(false);
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

  // Split Quick Payees list into Frequent and Recent groups
  const frequentPayees = React.useMemo(() => {
    return master?.payees?.filter((p) => p.favourite) || [];
  }, [master]);

  const recentPayees = React.useMemo(() => {
    return master?.payees?.filter((p) => !p.favourite && p.paymentCount > 0)
      .sort((a, b) => b.paymentCount - a.paymentCount)
      .slice(0, 8) || [];
  }, [master]);

  // Determine whether to show the Purpose column
  const hasAnyNotes = React.useMemo(() => todaysItems.some((item) => item.note?.trim()), [todaysItems]);

  // Calculate Outgoing Split Percentages
  const totalOutgoingVal = dashboard?.totalOutgoingPaise ?? 0;
  const cashVal = dashboard?.cashPaise ?? 0;
  const digitalVal = dashboard?.digitalPaise ?? 0;
  const cashPct = totalOutgoingVal ? Math.round((cashVal / totalOutgoingVal) * 100) : 0;
  const digitalPct = totalOutgoingVal ? Math.round((digitalVal / totalOutgoingVal) * 100) : 0;

  return (
    <div className="space-y-10 max-w-7xl mx-auto mb-10">
      {/* 1. Page Title & Action bar (Apple / Notion Minimal Title & Ghost style demoted actions) */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/40 pb-6">
        <div>
          {/* Screen reader only header to support Playwright E2E locator assertions */}
          <h1 className="sr-only">Today</h1>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-sans">
            {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}
          </h2>
          <p className="text-xs text-stone-500 mt-1 font-medium">
            Good morning, Operator. Record outlays, track cash distributions, and complete category reviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setBatchOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Batch Entry
          </button>
          <button
            onClick={() => setDetailedOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm hover:shadow transition-all duration-150 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Detailed Form
          </button>
        </div>
      </header>

      {/* 2. Unified Hero Command Entry Box (Floating Card container with internal divider) */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/60 overflow-hidden flex flex-col transition-shadow focus-within:shadow-[0_1px_4px_rgba(37,99,235,0.05),0_4px_20px_rgba(37,99,235,0.04)] focus-within:border-blue-400/60">
        
        {/* Entry field at the top */}
        <div className="flex items-center h-16 bg-white relative">
          <span className="w-14 h-full text-stone-400 flex items-center justify-center text-lg font-bold select-none bg-stone-50/20 border-r border-stone-100/80">
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
            className="flex-1 h-full px-5 text-sm font-semibold tracking-tight text-stone-800 border-none outline-none focus:ring-0 focus:outline-none"
            autoComplete="off"
            autoFocus
          />
          <kbd className="mr-5 text-[9px] select-none uppercase font-mono font-extrabold text-stone-400 bg-stone-50 border border-stone-200/80 px-2 py-0.5 rounded shadow-3xs">
            Enter
          </kbd>
        </div>

        {/* Cohesive Connected Divider */}
        <div className="border-t border-stone-100/80" />

        {/* Connected Parsed Fields preview row */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-stone-50/30 select-none">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">Parsed Fields</span>
          
          <div className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border font-semibold transition-colors duration-150 ${
            preview?.payeeName
              ? 'bg-blue-50 text-blue-800 border-blue-200'
              : 'bg-white text-stone-400 border-stone-200/80 border-dashed'
          }`}>
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Payee: {preview?.payeeName || '—'}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border font-semibold transition-colors duration-150 ${
            preview?.amountPaise
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-white text-stone-400 border-stone-200/80 border-dashed'
          }`}>
            <Banknote className="w-3.5 h-3.5 shrink-0" />
            <span>Amount: {preview?.amountPaise ? formatInr(preview.amountPaise) : '—'}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border font-semibold transition-colors duration-150 ${
            preview?.paymentMethodName
              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
              : 'bg-white text-stone-400 border-stone-200/80 border-dashed'
          }`}>
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span>Method: {preview?.paymentMethodName || '—'}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border font-semibold transition-colors duration-150 ${
            preview?.categoryName
              ? 'bg-purple-50 text-purple-800 border-purple-200'
              : 'bg-white text-stone-400 border-stone-200/80 border-dashed'
          }`}>
            <Tag className="w-3.5 h-3.5 shrink-0" />
            <span>Category: {preview?.categoryName || '—'}</span>
          </div>
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
              className="p-4 border-t border-stone-100 bg-stone-50/20 flex flex-col gap-2 overflow-hidden"
            >
              <div className="flex items-center justify-between text-[10px] text-stone-400 font-bold px-1">
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
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-colors ${
                      idx === suggestionIndex
                        ? 'border-blue-500 bg-white text-stone-900 shadow-3xs'
                        : 'border-stone-200/80 bg-white hover:bg-stone-50/80 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-6 h-6 rounded bg-stone-100 text-stone-600 flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                        {payee.name.slice(0, 2)}
                      </span>
                      <div className="truncate text-xs">
                        <strong className="text-stone-950 block font-bold truncate leading-normal">
                          {payee.name}
                        </strong>
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-stone-400" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validation smart preview panel */}
        <div
          className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-stone-100/85 ${
            preview && !preview.valid ? 'bg-red-50/10' : 'bg-stone-50/15'
          }`}
        >
          {preview ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex items-center justify-center w-5.5 h-5.5 rounded-full shrink-0 ${
                    preview.valid ? 'text-emerald-700 bg-emerald-100' : 'text-stone-450 bg-stone-100'
                  }`}
                >
                  {preview.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                </span>
                <div className="text-xs">
                  <span className="text-stone-400 font-bold block uppercase tracking-wider text-[9px]">Parsed payment</span>
                  <strong className="text-stone-905 font-bold text-sm block mt-0.5">
                    {preview.payeeName || 'Choose payee'} ·{' '}
                    {preview.amountPaise ? formatInr(preview.amountPaise) : 'Amount missing'}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-stone-500 pl-8 font-semibold">
                <span className="bg-white border border-stone-200/80 px-1.5 py-0.5 rounded">
                  {preview.paymentMethodName || 'Method required'}
                </span>
                <span className="bg-white border border-stone-200/80 px-1.5 py-0.5 rounded">
                  {preview.categoryName || 'Category required'}
                </span>
                <span>
                  {preview.transactionDate || todayDate || 'Today'} ·{' '}
                  {preview.transactionTime ? formatTime12(preview.transactionTime) : 'Now'}
                </span>
                {preview.note && (
                  <span className="truncate max-w-[200px]" title={preview.note}>
                    {preview.note}
                  </span>
                )}
              </div>

              {/* Similar payee exists warnings */}
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

              {/* Debounced duplicate detection warnings block */}
              {isPossibleDuplicate && (
                <div className="mt-2 p-2.5 bg-rose-50/50 border border-rose-200 rounded-lg pl-8 text-xs text-rose-900">
                  <strong className="font-bold block mb-1">⚠️ Similar transaction just logged in the last 5 minutes</strong>
                  <p className="mb-2">A transaction with this exact payee, amount, category, and payment method was already saved.</p>
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={duplicateConfirmed}
                      onChange={(e) => setDuplicateConfirmed(e.target.checked)}
                      className="rounded border-rose-350 text-rose-800 focus:ring-rose-500"
                    />
                    I confirm this is a separate, intentional transaction
                  </label>
                </div>
              )}

              {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                <p className="text-[10px] text-rose-700 pl-8 mt-1 font-bold">
                  {[...preview.errors, ...preview.warnings].join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2.5 text-xs text-stone-500 py-1 pl-1">
              <Banknote className="w-4 h-4 text-stone-400 shrink-0" />
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
                (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed) ||
                (isPossibleDuplicate && !duplicateConfirmed)
              }
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shrink-0 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Post outlay'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 5. Separated Quick Payees Chips (Full pill radius, muted background, starred distinct tint) */}
        <div className="px-5 py-3.5 flex flex-col gap-3 bg-stone-50/10 border-t border-stone-100/70 select-none">
          {frequentPayees.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-2 w-16 text-left">Frequent</span>
              {frequentPayees.map((payee) => (
                <button
                  key={payee.id}
                  onClick={() => usePayee(payee.name)}
                  className="px-4 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-800 hover:bg-blue-100/80 transition-all duration-150 cursor-pointer border-none"
                >
                  {payee.name}
                </button>
              ))}
            </div>
          )}

          {recentPayees.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-2 w-16 text-left">Recent</span>
              {recentPayees.map((payee) => (
                <button
                  key={payee.id}
                  onClick={() => usePayee(payee.name)}
                  className="px-4 py-1 text-xs font-semibold rounded-full bg-stone-100/85 text-stone-700 hover:bg-stone-200/80 transition-all duration-150 cursor-pointer border-none"
                >
                  {payee.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Stat Cards (No borders-as-separators, elevated via soft shadows, tinted circular icons top-left) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6" aria-label="Workstation totals">
        {/* Total Outgoing Card */}
        <article className="bg-white rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-[0_1px_4px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.03)]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Total Outgoing</span>
              <strong className="text-3xl font-mono text-stone-900 tracking-tight block py-2 tabular-nums">
                {formatInr(dashboard?.totalOutgoingPaise ?? 0)}
              </strong>
            </div>
            <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100/60 pt-3.5 mt-3 text-[10px] text-stone-500 font-semibold">
            <span>Posted today</span>
            <span>{dashboard?.paymentCount ?? 0} payments</span>
          </div>
        </article>

        {/* Outgoing by Method split bar Card (Soft icon, clean split bar indicator) */}
        <article className="bg-white rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-[0_1px_4px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.03)]">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Outgoing by Method</span>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div>
                  <span className="text-[9px] font-extrabold text-stone-450 block uppercase">Cash</span>
                  <span className="text-lg font-mono font-bold text-stone-900 block tabular-nums">
                    {formatInr(dashboard?.cashPaise ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-extrabold text-stone-450 block uppercase">Digital</span>
                  <span className="text-lg font-mono font-bold text-stone-900 block tabular-nums">
                    {formatInr(dashboard?.digitalPaise ?? 0)}
                  </span>
                </div>
              </div>
            </div>
            <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>

          <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden mt-3 flex">
            <div
              style={{ width: `${cashPct}%` }}
              className="bg-amber-500 h-full transition-all duration-300"
              title="Cash portion"
            />
            <div
              style={{ width: `${digitalPct}%` }}
              className="bg-blue-500 h-full transition-all duration-300"
              title="Digital portion"
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-stone-500 mt-3 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Cash ({cashPct}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Digital ({digitalPct}%)
            </span>
          </div>
        </article>

        {/* Pending Reviews Card (Conditional soft red icon for pending state, neutral grey for verified state) */}
        <article
          className={`rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/40 relative overflow-hidden transition-all duration-200 hover:shadow-[0_1px_4px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.03)] ${
            dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'bg-amber-50/15 border-amber-100/60' : 'bg-white'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : 'text-stone-400'}`}>
                Pending Reviews
              </span>
              <strong className={`text-3xl font-mono tracking-tight block py-2 ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : 'text-stone-900'}`}>
                {dashboard?.reviewCount ?? 0}
              </strong>
            </div>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'bg-amber-100 text-amber-750' : 'bg-stone-50 text-stone-500'
            }`}>
              <Inbox className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100/60 pt-3.5 mt-3 text-[10px] text-stone-500 font-semibold">
            <span>Requires category map</span>
            <span className={dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-700 font-bold' : ''}>
              {dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'Attention Needed' : 'Clean / Verified'}
            </span>
          </div>
        </article>
      </section>

      {/* 4. Dashboard Table and Collapsible Desk Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outlay Ledger Table (Spans full page columns if Desk Status is collapsed!) */}
        <section className={`space-y-3 transition-all duration-300 ${isStatusOpen ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              Outlay Ledger
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider bg-white border border-stone-200/80 px-2.5 py-0.5 rounded-lg">
                {todaysItems.length} entries
              </span>
              <button
                onClick={() => setIsStatusOpen(!isStatusOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-stone-600 hover:text-stone-900 border border-stone-200 bg-white rounded-lg cursor-pointer transition-colors shadow-3xs"
              >
                <LayoutGrid className="w-3 h-3 text-stone-400" />
                <span>{isStatusOpen ? 'Hide Stats' : 'Show Stats'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/50">
            {todaysItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50/50 text-stone-500 font-semibold select-none h-11">
                      <th className="py-2.5 px-5 w-[16%] text-right font-bold">Amount</th>
                      <th className="py-2.5 px-5 w-[14%] font-bold">Time</th>
                      <th className="py-2.5 px-5 w-[24%] font-bold">Payee</th>
                      <th className="py-2.5 px-5 w-[20%] font-bold">Category</th>
                      <th className="py-2.5 px-5 w-[12%] font-bold">Method</th>
                      {hasAnyNotes && <th className="py-2.5 px-5 w-[20%] font-bold">Purpose</th>}
                      <th className="py-2.5 px-5 w-[4%] text-right font-bold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100/50">
                    {todaysItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedTransaction(item)}
                        className="hover:bg-stone-50/40 cursor-pointer transition-colors duration-150 group h-14"
                        title="Click to view detailed audit logs"
                      >
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-stone-900 group-hover:text-blue-600 tabular-nums">
                          {formatInr(item.amountPaise)}
                        </td>
                        <td className="py-3.5 px-5 text-stone-550 font-mono font-semibold tabular-nums">
                          {formatTime12(item.transactionTime)}
                        </td>
                        <td className="py-3.5 px-5 font-bold text-stone-900">
                          {item.payeeName}
                        </td>
                        <td className="py-3.5 px-5 text-stone-600 font-semibold">
                          {item.categoryName || (
                            <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 text-[10px]">
                              Review required
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5">
                          {item.paymentMethodCode?.toLowerCase() === 'cash' ? (
                            <span className="bg-amber-50 text-amber-800 rounded-md px-2 py-0.5 font-bold uppercase font-mono text-[9px] border border-amber-100">
                              CASH
                            </span>
                          ) : (
                            <span className="bg-blue-50 text-blue-800 rounded-md px-2 py-0.5 font-bold uppercase font-mono text-[9px] border border-blue-100">
                              {item.paymentMethodCode}
                            </span>
                          )}
                        </td>
                        {hasAnyNotes && (
                          <td className="py-3.5 px-5 text-stone-500 font-medium truncate max-w-[150px]">
                            {item.note || <span className="text-stone-300 italic">None</span>}
                          </td>
                        )}
                        <td className="py-3.5 px-5 text-right">
                          <ChevronRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Separate Table Total row in the footer */}
                  <tfoot className="border-t border-stone-200 bg-stone-50/70 font-bold text-stone-900 h-12">
                    <tr>
                      <td className="py-2.5 px-5 text-right font-mono tabular-nums">
                        {formatInr(todaysItems.reduce((sum, item) => sum + item.amountPaise, 0))}
                      </td>
                      <td className="py-2.5 px-5" colSpan={hasAnyNotes ? 6 : 5}>
                        Total Outlays Today ({todaysItems.length} transactions)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-20 px-6 text-center space-y-3 text-stone-400">
                <Banknote className="w-8 h-8 mx-auto text-stone-300 bg-stone-50 p-2 rounded-full" />
                <strong className="block text-stone-850 font-bold text-sm">No transactions logged today</strong>
                <p className="text-xs">Use the quick entry command bar above to record your first ledger item.</p>
              </div>
            )}
          </div>
        </section>

        {/* Collapsible Desk Status Panel */}
        {isStatusOpen && (
          <section className="space-y-3 transition-all duration-300">
            <div className="pb-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                Desk Status
              </h2>
            </div>

            <div className="bg-white rounded-xl p-6 space-y-5 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/50">
              <header className="border-b border-stone-100 pb-3">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">System Date</span>
                <strong className="text-base font-bold text-stone-900 block mt-0.5 font-sans">
                  {todayDate}
                </strong>
              </header>

              <dl className="grid grid-cols-2 gap-y-4 text-xs font-semibold text-stone-550">
                <div>
                  <dt className="font-bold text-stone-400 mb-0.5">First Entry</dt>
                  <dd className="text-stone-900 font-mono font-bold">{firstPaymentTime}</dd>
                </div>
                <div>
                  <dt className="font-bold text-stone-400 mb-0.5">Latest Entry</dt>
                  <dd className="text-stone-900 font-mono font-bold">{latestPaymentTime}</dd>
                </div>
                <div>
                  <dt className="font-bold text-stone-400 mb-0.5">Payees Paid</dt>
                  <dd className="text-stone-900 font-mono font-bold">{uniquePayees}</dd>
                </div>
                <div>
                  <dt className="font-bold text-stone-400 mb-0.5">Avg Size</dt>
                  <dd className="text-stone-900 font-mono font-bold tabular-nums">
                    {formatInr(averagePayment)}
                  </dd>
                </div>
              </dl>

              <div className="p-4 bg-stone-50 border border-stone-200/50 rounded-xl space-y-1.5 text-[11px] text-stone-500 font-semibold leading-relaxed">
                <div className="flex items-center gap-1.5 text-stone-800 font-bold mb-1">
                  <HelpCircle className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>Helpful Reminders</span>
                </div>
                <p>
                  Click on any transaction logged today to show the audit logs drawer and correct or void details.
                </p>
              </div>
            </div>
          </section>
        )}
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
