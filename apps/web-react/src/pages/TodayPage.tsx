import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { RefreshCw, ListPlus, FileText, CheckCircle2, Search, ArrowRight, Banknote } from 'lucide-react';
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

  // Suggestion list derivation
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
    <div className="space-y-6">
      {/* Header toolbar */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink">Today</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setBatchOpen(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Batch entry
          </button>
          <button
            onClick={() => setDetailedOpen(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
          >
            <FileText className="w-3.5 h-3.5" />
            Detailed entry
          </button>
        </div>
      </header>

      {/* Command Station Card */}
      <section className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm flex flex-col">
        {/* Command input row */}
        <div className="flex items-center h-16 border-b border-ledger-border/80 bg-white">
          <span className="w-14 h-full border-r border-ledger-border/60 text-ledger-blue flex items-center justify-center text-2xl font-extrabold select-none bg-ledger-workspace/30">
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
            className="flex-1 h-full px-5 text-xl font-semibold tracking-tight text-ledger-ink border-none outline-none focus:ring-0 focus:outline-none"
            autoComplete="off"
            autoFocus
          />
          <kbd className="mr-5 text-[10px] select-none uppercase font-bold text-ledger-muted bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded">
            Enter ↵
          </kbd>
        </div>

        {/* Suggestions dropdown overlay */}
        {commandPayeeSuggestions.length > 0 && suggestionIndex >= 0 && (
          <div
            id="payee-listbox"
            role="listbox"
            aria-label="Payee matches"
            className="p-3 pl-14 border-b border-ledger-border/60 bg-white flex flex-col gap-2"
          >
            <span className="text-[10px] text-ledger-muted font-medium block">
              Payee matches <kbd className="text-[9px]">↑↓</kbd> move <kbd className="text-[9px]">Tab</kbd> select
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {commandPayeeSuggestions.map((payee, idx) => (
                <div
                  key={payee.id}
                  role="option"
                  aria-selected={idx === suggestionIndex}
                  onClick={() => chooseCommandPayee(payee)}
                  className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                    idx === suggestionIndex
                      ? 'border-ledger-blue bg-ledger-selection/60'
                      : 'border-ledger-border hover:bg-ledger-workspace'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="w-7 h-7 rounded bg-ledger-blue/10 text-ledger-blue flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {payee.name.slice(0, 2)}
                    </span>
                    <div className="truncate text-xs">
                      <strong className="text-ledger-ink block font-semibold truncate">{payee.name}</strong>
                      <span className="text-[10px] text-ledger-muted capitalize font-medium">
                        {payee.type}
                        {payee.aliases.length > 0 ? ` · ${payee.aliases.join(', ')}` : ''}
                      </span>
                    </div>
                  </div>
                  <kbd className="text-[9px] scale-90">Tab</kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parsed preview section */}
        <div
          className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ledger-border/40 ${
            preview && !preview.valid ? 'bg-red-50/20' : 'bg-ledger-workspace/15'
          }`}
        >
          {preview ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                    preview.valid ? 'text-emerald-600 bg-emerald-50' : 'text-ledger-muted bg-ledger-workspace'
                  }`}
                >
                  {preview.valid ? <CheckCircle2 className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                </span>
                <div className="text-xs">
                  <span className="text-ledger-muted font-medium block">Parsed payment</span>
                  <strong className="text-ledger-ink font-bold text-sm">
                    {preview.payeeName || 'Choose a known payee'} ·{' '}
                    {preview.amountPaise ? formatInr(preview.amountPaise) : 'Amount missing'}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ledger-muted pl-8 font-medium">
                <span className="bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded">
                  {preview.paymentMethodName || 'Method required'}
                </span>
                <span className="bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded">
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
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg pl-8 text-xs text-amber-800">
                  <strong className="font-semibold block mb-1">Similar payees exist</strong>
                  <div className="flex flex-wrap gap-2">
                    {similarPayees.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => useSimilarPayee(p.name)}
                        className="px-2 py-1 bg-white border border-amber-200 hover:border-amber-400 rounded text-xs text-amber-900 transition-colors"
                      >
                        Use {p.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setNewPayeeConfirmed(true)}
                      className="px-2 py-1 bg-amber-800 text-white rounded text-xs hover:bg-amber-900 transition-colors"
                    >
                      Create “{preview.payeeName}” anyway
                    </button>
                  </div>
                </div>
              )}

              {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                <p className="text-[11px] text-ledger-review/80 pl-8 mt-1.5 font-medium">
                  {[...preview.errors, ...preview.warnings].join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-3 text-xs text-ledger-muted">
              <Banknote className="w-5 h-5 text-ledger-muted/80 shrink-0" />
              <div>
                <span>Cash is the default payment method.</span>
                <small className="block text-[10px] text-ledger-muted/70 mt-0.5">
                  New payee names are created and sent to Review automatically.
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
              className="btn btn-primary text-xs py-2 px-4 shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              {saving ? 'Saving...' : 'Save payment'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick payees chips row */}
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-2 bg-ledger-workspace/30">
          <span className="text-xs font-semibold text-ledger-muted mr-1.5">Quick payees</span>
          {master?.payees && master.payees.filter((p) => p.favourite || p.paymentCount > 2).length > 0 ? (
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
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-all hover:-translate-y-[0.5px] duration-100 ${
                    payee.favourite
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300'
                      : 'bg-white text-ledger-ink border-ledger-border hover:bg-ledger-workspace'
                  }`}
                >
                  {payee.favourite && <span className="text-amber-500 mr-1">★</span>}
                  {payee.name}
                </button>
              ))
          ) : (
            <span className="text-[11px] text-ledger-muted font-medium">
              Frequent or favourite payees will appear here as quick entry links.
            </span>
          )}
        </div>
      </section>

      {/* Summary statistics row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Today's totals">
        <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border shadow-xs">
          <span className="text-xs font-semibold text-ledger-muted">Total outgoing</span>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
            {formatInr(dashboard?.totalOutgoingPaise ?? 0)}
          </strong>
          <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
            {dashboard?.paymentCount ?? 0} payments
          </span>
        </article>

        <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border shadow-xs">
          <span className="text-xs font-semibold text-ledger-muted">Cash</span>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
            {formatInr(dashboard?.cashPaise ?? 0)}
          </strong>
          <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
            {dashboard?.totalOutgoingPaise
              ? `${Math.round(((dashboard.cashPaise ?? 0) / dashboard.totalOutgoingPaise) * 100)}% of total`
              : '0% of total'}
          </span>
        </article>

        <article className="ledger-card flex flex-col justify-between py-4 border-ledger-border shadow-xs">
          <span className="text-xs font-semibold text-ledger-muted">Digital</span>
          <strong className="text-2xl font-mono text-ledger-ink tracking-tight mt-1.5 tabular-nums">
            {formatInr(dashboard?.digitalPaise ?? 0)}
          </strong>
          <span className="text-[10px] text-ledger-muted mt-0.5 font-medium">
            UPI, bank and cheque
          </span>
        </article>

        <article
          className={`ledger-card flex flex-col justify-between py-4 border-ledger-border shadow-xs ${
            dashboard?.reviewCount && dashboard.reviewCount > 0
              ? 'bg-ledger-review/10 border-ledger-review/25 text-ledger-review'
              : ''
          }`}
        >
          <span className="text-xs font-semibold">Needs review</span>
          <strong className="text-2xl font-mono tracking-tight mt-1.5 tabular-nums">
            {dashboard?.reviewCount ?? 0}
          </strong>
          <span className="text-[10px] mt-0.5 font-medium">
            {dashboard?.reviewCount && dashboard.reviewCount > 0
              ? 'Verification pending'
              : 'Nothing pending'}
          </span>
        </article>
      </section>

      {/* Main today grid operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent payments table */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ledger-ink">
              Recent payments
            </h2>
            <span className="text-[11px] text-ledger-muted font-medium">
              {todaysItems.length} shown
            </span>
          </div>

          <div className="ledger-card p-0 overflow-hidden border-ledger-border">
            {todaysItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <tbody className="divide-y divide-ledger-border/40">
                    {todaysItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedTransaction(item)}
                        className="hover:bg-ledger-selection/30 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-ledger-ink group-hover:text-ledger-blue tabular-nums w-[16%]">
                          {formatInr(item.amountPaise)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-ledger-ink w-[28%]">
                          {item.payeeName}
                        </td>
                        <td className="py-3 px-4 text-ledger-muted font-medium w-[22%]">
                          {item.categoryName || (
                            <span className="text-ledger-review font-semibold">Review required</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ledger-muted font-medium w-[12%] capitalize">
                          {item.paymentMethodCode}
                        </td>
                        <td className="py-3 px-4 text-ledger-muted font-medium truncate max-w-[150px]">
                          {item.note || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {item.needsReview && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-ledger-review/10 text-ledger-review rounded border border-ledger-review/20">
                              Review
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 px-6 text-center space-y-2 text-ledger-muted">
                <strong className="block text-ledger-ink font-semibold text-sm">No payments yet</strong>
                <p className="text-xs">Use the command field above to record the first one.</p>
              </div>
            )}
          </div>
        </section>

        {/* Today status panel */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ledger-ink">
            Today status
          </h2>
          <div className="ledger-card border-ledger-border space-y-4">
            <header>
              <span className="text-[10px] uppercase font-bold text-ledger-muted block">Date</span>
              <strong className="text-lg font-bold text-ledger-ink">{todayDate}</strong>
            </header>

            <dl className="grid grid-cols-2 gap-y-4 text-xs">
              <div>
                <dt className="text-ledger-muted font-medium mb-0.5">First payment</dt>
                <dd className="text-ledger-ink font-mono font-bold">{firstPaymentTime}</dd>
              </div>
              <div>
                <dt className="text-ledger-muted font-medium mb-0.5">Latest payment</dt>
                <dd className="text-ledger-ink font-mono font-bold">{latestPaymentTime}</dd>
              </div>
              <div>
                <dt className="text-ledger-muted font-medium mb-0.5">Unique payees</dt>
                <dd className="text-ledger-ink font-mono font-bold">{uniquePayees}</dd>
              </div>
              <div>
                <dt className="text-ledger-muted font-medium mb-0.5">Average payment</dt>
                <dd className="text-ledger-ink font-mono font-bold tabular-nums">
                  {formatInr(averagePayment)}
                </dd>
              </div>
            </dl>

            <p className="text-[10px] text-ledger-muted/80 leading-normal border-t border-ledger-border/40 pt-3">
              Corrections and void operations remain available inside the main Ledger dashboard.
            </p>
          </div>
        </section>
      </div>

      {/* Drawers and modals */}
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
