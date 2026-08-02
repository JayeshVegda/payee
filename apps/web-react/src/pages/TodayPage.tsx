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
      {/* Dynamic Glassmorphic Hero Greeting */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-slate-900 via-ledger-ink to-[#1a2e4c] text-white p-6 rounded-2xl border border-slate-800 shadow-md">
        <div>
          <span className="text-[10px] tracking-widest font-mono text-ledger-blue uppercase font-bold bg-ledger-blue/10 px-2 py-0.5 rounded border border-ledger-blue/20">
            Cash Desk Workstation
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-2 font-sans">
            Today
          </h1>
          <p className="text-xs text-slate-300 mt-1 leading-normal font-medium max-w-lg">
            Good morning, Operator. Record cash outlays, digital transfers, and audit payee account statements. Keyboard shortcuts remain active.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors cursor-pointer bg-slate-950/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setBatchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors cursor-pointer bg-slate-950/20"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Batch Entry
          </button>
          <button
            onClick={() => setDetailedOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-gradient-to-r from-ledger-blue to-indigo-600 hover:from-ledger-blue hover:to-indigo-500 text-white rounded-lg transition-all shadow-md cursor-pointer hover:shadow-lg hover:-translate-y-0.5 duration-150"
          >
            <FileText className="w-3.5 h-3.5" />
            Detailed Form
          </button>
        </div>
      </header>

      {/* Metric Cards Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" aria-label="Workstation totals">
        <article className="ledger-card flex flex-col justify-between p-5 border-ledger-border bg-white shadow-xs relative overflow-hidden group hover:border-ledger-blue/40 transition-colors">
          <div className="flex items-center justify-between text-ledger-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Outgoing</span>
            <TrendingUp className="w-4 h-4 text-ledger-blue" />
          </div>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-3 block tabular-nums">
            {formatInr(dashboard?.totalOutgoingPaise ?? 0)}
          </strong>
          <div className="flex items-center justify-between border-t border-ledger-border/40 pt-2.5 mt-3 text-[10px] text-ledger-muted font-medium">
            <span>Posted ledger</span>
            <span>{dashboard?.paymentCount ?? 0} payments</span>
          </div>
        </article>

        <article className="ledger-card flex flex-col justify-between p-5 border-ledger-border bg-white shadow-xs relative overflow-hidden group hover:border-ledger-blue/40 transition-colors">
          <div className="flex items-center justify-between text-ledger-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Cash Ledger</span>
            <Banknote className="w-4 h-4 text-amber-600" />
          </div>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-3 block tabular-nums">
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
              className="bg-amber-55 h-full rounded-full"
            />
          </div>
        </article>

        <article className="ledger-card flex flex-col justify-between p-5 border-ledger-border bg-white shadow-xs relative overflow-hidden group hover:border-ledger-blue/40 transition-colors">
          <div className="flex items-center justify-between text-ledger-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Digital Ledger</span>
            <CreditCard className="w-4 h-4 text-indigo-600" />
          </div>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-3 block tabular-nums">
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
              className="bg-ledger-blue h-full rounded-full"
            />
          </div>
        </article>

        <article
          className={`ledger-card flex flex-col justify-between p-5 border-ledger-border bg-white shadow-xs relative overflow-hidden transition-all ${
            dashboard?.reviewCount && dashboard.reviewCount > 0
              ? 'bg-amber-50/10 border-amber-250 ring-1 ring-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.06)]'
              : 'hover:border-ledger-blue/40'
          }`}
        >
          <div className="flex items-center justify-between text-ledger-muted">
            <span className={`text-xs font-semibold uppercase tracking-wider ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : ''}`}>
              Pending Reviews
            </span>
            <Inbox className={`w-4 h-4 ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-600' : ''}`} />
          </div>
          <strong className={`text-2xl font-mono tracking-tight mt-3 block ${dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800' : 'text-ledger-ink'}`}>
            {dashboard?.reviewCount ?? 0}
          </strong>
          <div className="flex items-center justify-between border-t border-ledger-border/40 pt-2.5 mt-3 text-[10px] text-ledger-muted font-medium">
            <span>Requires category map</span>
            <span className={dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'text-amber-800 font-extrabold' : ''}>
              {dashboard?.reviewCount && dashboard.reviewCount > 0 ? 'Attention Needed' : 'Clean'}
            </span>
          </div>
        </article>
      </section>

      {/* Main Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Quick Entry Console) */}
        <section className="lg:col-span-2 space-y-6">
          {/* Command Console Card */}
          <div className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm flex flex-col bg-white">
            <header className="px-5 py-3 border-b border-ledger-border/60 bg-ledger-workspace/30 flex items-center justify-between text-[11px] font-semibold text-ledger-muted">
              <span>SMART COMMAND STATION</span>
              <span className="font-mono text-[9px] uppercase tracking-wider bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                Keyboard Active
              </span>
            </header>

            {/* Input Bar */}
            <div className="flex items-center h-16 border-b border-ledger-border/80 bg-white relative">
              <span className="w-14 h-full border-r border-ledger-border/60 text-ledger-blue flex items-center justify-center text-2xl font-black select-none bg-ledger-workspace/20">
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
                className="flex-1 h-full px-5 text-lg font-bold tracking-tight text-ledger-ink border-none outline-none focus:ring-0 focus:outline-none"
                autoComplete="off"
                autoFocus
              />
              <kbd className="mr-5 text-[9px] select-none uppercase font-extrabold text-ledger-muted bg-ledger-workspace border border-ledger-border px-2 py-1 rounded-md shadow-2xs">
                Enter ↵
              </kbd>
            </div>

            {/* Suggestions dropdown overlay */}
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
                  className="p-3.5 border-b border-ledger-border/60 bg-white flex flex-col gap-2.5 overflow-hidden"
                >
                  <div className="flex items-center justify-between text-[10px] text-ledger-muted font-medium">
                    <span>Payee Suggestions matched by alias/prefix:</span>
                    <span>
                      Move <kbd className="text-[9px]">↑↓</kbd> · Select <kbd className="text-[9px]">Tab</kbd>
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
                            ? 'border-ledger-blue bg-ledger-selection/65 shadow-2xs'
                            : 'border-ledger-border hover:bg-ledger-workspace'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="w-7 h-7 rounded-md bg-ledger-blue/10 text-ledger-blue flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {payee.name.slice(0, 2)}
                          </span>
                          <div className="truncate text-xs">
                            <strong className="text-ledger-ink block font-semibold truncate leading-normal">
                              {payee.name}
                            </strong>
                            <span className="text-[10px] text-ledger-muted capitalize font-medium leading-none block mt-0.5">
                              {payee.type}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-3 h-3 text-ledger-muted/60" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Parsed validation preview panel */}
            <div
              className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                preview && !preview.valid ? 'bg-red-50/15' : 'bg-ledger-workspace/15'
              }`}
            >
              {preview ? (
                <div className="flex-1 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                        preview.valid ? 'text-emerald-700 bg-emerald-100' : 'text-ledger-muted bg-ledger-workspace'
                      }`}
                    >
                      {preview.valid ? <CheckCircle2 className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                    </span>
                    <div className="text-xs">
                      <span className="text-ledger-muted font-bold block uppercase tracking-wider text-[9px]">Parsed Payment</span>
                      <strong className="text-ledger-ink font-bold text-sm block mt-0.5">
                        {preview.payeeName || 'Choose a known payee'} ·{' '}
                        {preview.amountPaise ? formatInr(preview.amountPaise) : 'Amount missing'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-ledger-muted pl-9 font-semibold">
                    <span className="bg-white border border-ledger-border px-2 py-0.5 rounded">
                      {preview.paymentMethodName || 'Method required'}
                    </span>
                    <span className="bg-white border border-ledger-border px-2 py-0.5 rounded">
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
                    <div className="mt-2.5 p-3 bg-amber-50 border border-amber-250 rounded-lg pl-9 text-xs text-amber-800">
                      <strong className="font-semibold block mb-1">Warning: Similar payee alias matches found</strong>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {similarPayees.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => useSimilarPayee(p.name)}
                            className="px-2 py-1 bg-white border border-amber-200 hover:border-amber-400 rounded text-[11px] text-amber-900 transition-colors cursor-pointer"
                          >
                            Use {p.name}
                          </button>
                        ))}
                        <button
                          onClick={() => setNewPayeeConfirmed(true)}
                          className="px-2.5 py-1 bg-amber-800 text-white rounded text-[11px] hover:bg-amber-900 transition-colors cursor-pointer"
                        >
                          Create “{preview.payeeName}” anyway
                        </button>
                      </div>
                    </div>
                  )}

                  {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                    <p className="text-[11px] text-ledger-review/85 pl-9 mt-1 font-bold">
                      {[...preview.errors, ...preview.warnings].join(' · ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-3 text-xs text-ledger-muted py-1">
                  <Banknote className="w-5 h-5 text-ledger-muted/70 shrink-0" />
                  <div>
                    <span>Cash is the default payment method.</span>
                    <small className="block text-[10px] text-ledger-muted/70 mt-0.5">
                      New payee names are automatically saved for verification in Review.
                    </small>
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
                  className="btn btn-primary text-xs py-2.5 px-4.5 shrink-0 flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer duration-100"
                >
                  {saving ? 'Saving...' : 'Post payment'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick payees chips row */}
            <div className="px-5 py-3.5 flex flex-wrap items-center gap-2 bg-ledger-workspace/20 border-t border-ledger-border/40 select-none">
              <span className="text-xs font-semibold text-ledger-muted mr-1.5">Quick payees</span>
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
                      className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all duration-100 cursor-pointer ${
                        payee.favourite
                          ? 'bg-amber-50 text-amber-800 border-amber-255 hover:bg-amber-100 hover:border-amber-350 shadow-2xs'
                          : 'bg-white text-ledger-ink border-ledger-border hover:bg-ledger-workspace hover:border-slate-300'
                      }`}
                    >
                      {payee.favourite && <span className="text-amber-500 mr-1 font-bold">★</span>}
                      {payee.name}
                    </button>
                  ))
              ) : (
                <span className="text-[11px] text-ledger-muted font-medium">
                  Frequent or favourite payees will appear here as quick entry links.
                </span>
              )}
            </div>
          </div>

          {/* Recent payments table panel */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-ledger-border pb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ledger-ink flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ledger-blue" />
                Recent Payments Log
              </h2>
              <span className="text-[10px] font-bold text-ledger-muted uppercase tracking-wider bg-ledger-workspace border border-ledger-border px-2 py-0.5 rounded">
                {todaysItems.length} transactions
              </span>
            </div>

            <div className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm bg-white">
              {todaysItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-ledger-border bg-ledger-workspace/30 text-ledger-muted font-semibold">
                        <th className="py-2 px-4 w-[16%] text-right font-semibold">Amount</th>
                        <th className="py-2 px-4 w-[28%] font-semibold">Payee</th>
                        <th className="py-2 px-4 w-[22%] font-semibold">Category</th>
                        <th className="py-2 px-4 w-[12%] font-semibold">Method</th>
                        <th className="py-2 px-4 w-[22%] font-semibold">Purpose</th>
                        <th className="py-2 px-4 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ledger-border/40">
                      {todaysItems.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedTransaction(item)}
                          className="hover:bg-ledger-selection/15 cursor-pointer transition-colors group"
                        >
                          <td className="py-3 px-4 text-right font-mono font-bold text-ledger-ink group-hover:text-ledger-blue tabular-nums">
                            {formatInr(item.amountPaise)}
                          </td>
                          <td className="py-3 px-4 font-bold text-ledger-ink">
                            {item.payeeName}
                          </td>
                          <td className="py-3 px-4 text-ledger-muted font-semibold">
                            {item.categoryName || (
                              <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Review required
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-ledger-muted font-semibold uppercase font-mono text-[10px]">
                            {item.paymentMethodCode}
                          </td>
                          <td className="py-3 px-4 text-ledger-muted font-medium truncate max-w-[150px]">
                            {item.note || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.needsReview ? (
                              <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-50 text-amber-800 rounded-full border border-amber-255">
                                Review
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-250">
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
                <div className="py-16 px-6 text-center space-y-3 text-ledger-muted">
                  <Banknote className="w-8 h-8 mx-auto text-ledger-muted/60 bg-ledger-workspace p-1.5 rounded-full" />
                  <strong className="block text-ledger-ink font-semibold text-sm">No transactions logged today</strong>
                  <p className="text-xs">Use the quick entry command bar above to record your first ledger item.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column (Desk Status Panel) */}
        <section className="space-y-6">
          <div className="border-b border-ledger-border pb-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ledger-ink flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-ledger-blue" />
              Operator Workspace
            </h2>
          </div>

          <div className="ledger-card border-ledger-border p-5 space-y-5 bg-white shadow-xs">
            <header className="border-b border-ledger-border/40 pb-3">
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">System Date</span>
              <strong className="text-lg font-extrabold text-ledger-ink tracking-tight block mt-0.5">
                {todayDate}
              </strong>
            </header>

            <dl className="grid grid-cols-2 gap-y-4 text-xs font-semibold text-ledger-muted">
              <div>
                <dt className="font-medium text-ledger-muted mb-0.5">First entry time</dt>
                <dd className="text-ledger-ink font-mono font-bold">{firstPaymentTime}</dd>
              </div>
              <div>
                <dt className="font-medium text-ledger-muted mb-0.5">Latest entry time</dt>
                <dd className="text-ledger-ink font-mono font-bold">{latestPaymentTime}</dd>
              </div>
              <div>
                <dt className="font-medium text-ledger-muted mb-0.5">Unique payees paid</dt>
                <dd className="text-ledger-ink font-mono font-bold">{uniquePayees}</dd>
              </div>
              <div>
                <dt className="font-medium text-ledger-muted mb-0.5">Average payment size</dt>
                <dd className="text-ledger-ink font-mono font-bold tabular-nums">
                  {formatInr(averagePayment)}
                </dd>
              </div>
            </dl>

            <div className="p-3 bg-ledger-workspace border border-ledger-border rounded-xl space-y-2 text-[11px] text-ledger-muted font-medium">
              <div className="flex items-center gap-2 text-ledger-ink font-bold">
                <HelpCircle className="w-4 h-4 text-ledger-blue shrink-0" />
                <span>Helpful reminders</span>
              </div>
              <p className="leading-relaxed">
                Voiding and editing actions can be performed securely by clicking on any transaction in the list to reveal the audit drawer.
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
