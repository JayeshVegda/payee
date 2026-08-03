import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  api,
  post,
  formatInr,
  formatTime12,
  DashboardData,
  MasterData,
  QuickPreview,
  QuickSaveResult,
  LedgerTransaction,
  Payee
} from '../api/client';
import { ApiError } from '../api/client';
import Fuse from 'fuse.js';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Banknote,
  ArrowRight,
  Sparkles,
  Inbox,
  Calendar,
  User,
  Tag,
  Wallet,
  Zap,
  Check,
  Star,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

import QuickReviewModal from '../components/review/QuickReviewModal';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { StatusPill } from '../components/common/StatusPill';
import { TransactionDrawer } from '../components/common/TransactionDrawer';
import { ConfirmModal } from '../components/common/ConfirmModal';

export default function TodayPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [command, setCommand] = useState('');
  const [preview, setPreview] = useState<QuickPreview | null>(null);
  const [previewCommand, setPreviewCommand] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);

  // Confirmation / Edit States
  const [drawerInitialEdit, setDrawerInitialEdit] = useState(false);
  const [voidConfirmTx, setVoidConfirmTx] = useState<LedgerTransaction | null>(null);
  const [quickAddConfirmOpen, setQuickAddConfirmOpen] = useState(false);

  const handleVoidTransaction = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to void this transaction?')) return;
    try {
      await post(`/transactions/${id}/void`, { reason: 'Voided from Today after user review' });
      await refetchTransactions();
      await refetchDashboard();
      toast.success('Transaction voided successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to void transaction');
    }
  };
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newPayeeConfirmed, setNewPayeeConfirmed] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState('');


  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);
  const [reviewTransaction, setReviewTransaction] = useState<{
    id: number;
    updatedAt: string;
    payeeId?: number;
    amountPaise?: number;
    payeeName?: string;
    categoryId?: number | null;
    paymentMethodId?: number | null;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | undefined>(undefined);

  // Queries
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard
  } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard')
  });

  const { data: master, isError: masterError, refetch: refetchMaster } = useQuery<MasterData>({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data')
  });

  const todayDate = dashboard?.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    isError: transactionsError,
    refetch: refetchTransactions
  } = useQuery<{ items: LedgerTransaction[] }>({
    queryKey: ['transactions', todayDate],
    queryFn: () => api<{ items: LedgerTransaction[] }>(`/transactions?date=${todayDate}&pageSize=100`),
    enabled: !!todayDate
  });

  const todaysItems = transactionsData?.items || [];
  const loading = dashboardLoading || transactionsLoading;
  const hasError = dashboardError || masterError || transactionsError;
  const hasAmountInput = useMemo(
    () => /(?:^|\s)(?:\d+(?:[.,]\d+)?|\.\d+)\s*(?:k|l|lac|lakh)?(?=\s|$)/i.test(command),
    [command]
  );

  const { data: lastPaymentData } = useQuery<{ items: LedgerTransaction[] }>({
    queryKey: ['payee-last-payment', preview?.payeeId],
    queryFn: () => api<{ items: LedgerTransaction[] }>(`/transactions?payeeId=${preview!.payeeId}&pageSize=1`),
    enabled: Boolean(preview?.payeeId)
  });
  const lastPayment = lastPaymentData?.items[0];

  const handleRefresh = async () => {
    await Promise.all([refetchDashboard().catch(() => null), refetchMaster().catch(() => null), refetchTransactions().catch(() => null)]);
    toast.success('Today data refreshed');
  };

  // Google-style ranking: strong prefix matches first, then favourites and usage.
  const commandPayeeSuggestions = useMemo(() => {
    const trimmed = command.trim();
    if (!trimmed || !master?.payees) return [];
    
    // Extract the text token before any numbers (amount)
    const textToken = command.split(/\d/)[0]?.trim() || trimmed;
    
    if (textToken.length > 0) {
      const fuse = new Fuse(master.payees, {
        keys: [
          { name: 'name', weight: 0.76 },
          { name: 'aliases', weight: 0.24 }
        ],
        threshold: 0.46,
        distance: 80,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 1
      });
      const query = textToken.toLocaleLowerCase('en-IN');
      return fuse.search(textToken)
        .sort((left, right) => {
          const leftPrefix = left.item.name.toLocaleLowerCase('en-IN').startsWith(query) ? 1 : 0;
          const rightPrefix = right.item.name.toLocaleLowerCase('en-IN').startsWith(query) ? 1 : 0;
          if (leftPrefix !== rightPrefix) return rightPrefix - leftPrefix;
          if (left.item.favourite !== right.item.favourite) return Number(right.item.favourite) - Number(left.item.favourite);
          const usageDifference = right.item.paymentCount - left.item.paymentCount;
          if (usageDifference !== 0) return usageDifference;
          return (left.score ?? 1) - (right.score ?? 1);
        })
        .map((result) => result.item)
        .slice(0, 4);
    }
    
    return master.payees.slice(0, 6);
  }, [command, master?.payees]);

  // Handle Quick Entry input & live preview
  useEffect(() => {
    window.clearTimeout(previewTimerRef.current);
    setSuggestionIndex(-1);

    if (!command.trim()) {
      setPreview(null);
      setPreviewCommand('');
      setNewPayeeConfirmed(false);
      setDuplicateConfirmed(false);
      setDuplicateReason('');
      setShowSuggestions(false);
      return;
    }

    const payeePrefix = command.split(/\d/)[0]?.trim() ?? '';
    const normalizedPayeePrefix = payeePrefix.toLocaleLowerCase('en-IN');
    const exactPayee = master?.payees.some((payee) =>
      [payee.name, ...payee.aliases].some(
        (name) => name.toLocaleLowerCase('en-IN') === normalizedPayeePrefix
      )
    );
    setShowSuggestions(
      Boolean(payeePrefix) &&
      !exactPayee &&
      (!hasAmountInput || commandPayeeSuggestions.length > 0)
    );

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await post<QuickPreview>('/quick-entry/preview', { command });
        setPreview(res);
        setPreviewCommand(command.trim());
      } catch {
        setPreview(null);
        setPreviewCommand('');
      }
    }, 120);

    return () => window.clearTimeout(previewTimerRef.current);
  }, [command, master?.payees, hasAmountInput, commandPayeeSuggestions.length]);

  useEffect(() => {
    if (suggestionIndex < 0) return;
    document
      .getElementById(`payee-suggestion-${suggestionIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [suggestionIndex]);

  const executeSave = async (payeeConfirmed: boolean, dupConfirmed: boolean) => {
    if (!command.trim() || saving) return;
    setSaving(true);
    try {
      const res = await post<QuickSaveResult>('/quick-entry/save', {
        command,
        confirmNewPayee: payeeConfirmed,
        confirmDuplicate: dupConfirmed
      });

      const saved = res.transaction;
      toast.success(`${formatInr(saved.amountPaise)} paid to ${saved.payeeName}`, {
        description: `${saved.categoryName || 'Uncategorised'} · ${saved.paymentMethodName || 'Cash'} · ${formatTime12(saved.transactionTime)}`
      });
      setQuickAddConfirmOpen(false);
      setCommand('');
      setPreview(null);
      setPreviewCommand('');
      setNewPayeeConfirmed(false);
      setDuplicateConfirmed(false);
      setShowSuggestions(false);
      await queryClient.invalidateQueries();

      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err: any) {
      const msg = err.message || '';
      if ((err instanceof ApiError && err.code === 'DUPLICATE_TRANSACTION') || msg.toLowerCase().includes('duplicate')) {
        setDuplicateConfirmed(true);
        setDuplicateReason(msg);
        setQuickAddConfirmOpen(true);
      } else if (msg.toLowerCase().includes('payee')) {
        toast.error('New payee detected. Press Enter again to confirm.');
      } else {
        toast.error(msg || 'Failed to record payment');
      }
    } finally {
      setSaving(false);
    }
  };

  const applyPayeeSuggestion = (payee: Payee) => {
    // Replace the text portion with the selected payee name and append a space
    const amountMatch = command.match(/\d.*/);
    const amountPart = amountMatch ? ` ${amountMatch[0]}` : ' ';
    setCommand(`${payee.name}${amountPart}`);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleSaveAttempt = () => {
    if (preview?.errors.length) {
      toast.error(preview.errors[0]);
      return;
    }
    
    if (!preview?.valid || previewCommand !== command.trim()) return;
    setQuickAddConfirmOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && commandPayeeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % commandPayeeSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => prev < 0 ? commandPayeeSuggestions.length - 1 : (prev - 1 + commandPayeeSuggestions.length) % commandPayeeSuggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const idx = suggestionIndex >= 0 ? suggestionIndex : 0;
        const selected = commandPayeeSuggestions[idx];
        if (selected) applyPayeeSuggestion(selected);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (e.ctrlKey) {
        if (preview?.valid && (!preview?.errors || preview.errors.length === 0)) {
          executeSave(true, true);
        }
        return;
      }

      // A visible suggestion must be accepted before saving, including typo corrections
      // after an amount has already been entered. Escape keeps the text as a new payee.
      if (showSuggestions && commandPayeeSuggestions.length > 0) {
        const idx = suggestionIndex >= 0 ? suggestionIndex : 0;
        const selected = commandPayeeSuggestions[idx];
        if (selected) {
          applyPayeeSuggestion(selected);
          return;
        }
      }

      handleSaveAttempt();
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleFrequentClick = (payeeName: string) => {
    setCommand(`${payeeName} `);
    inputRef.current?.focus();
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="w-full space-y-4">
      <h1 className="sr-only">Today</h1>
      {hasError && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          <span className="font-semibold">Connection Error:</span>
          <span>Unable to connect to the backend server. Please verify the server is running locally on port 4782.</span>
          <button onClick={handleRefresh} className="ml-auto underline font-semibold hover:text-red-900">Retry</button>
        </div>
      )}
      <section className="relative rounded-2xl border border-[#DDE3EC] bg-white px-4 py-4 shadow-[var(--shadow-card)] md:px-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-[#111827]">Record payment</h1>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            { label: 'Date', value: preview?.transactionDate === todayDate || !preview?.transactionDate ? 'Today' : preview.transactionDate, tone: 'bg-slate-100 text-slate-600' },
            { label: 'Payee', value: preview?.payeeName || 'Not selected', tone: 'bg-violet-50 text-violet-700' },
            { label: 'Amount', value: preview?.amountPaise ? formatInr(preview.amountPaise) : '—', tone: 'bg-emerald-50 text-emerald-700' },
            { label: 'Category', value: preview?.categoryName || 'Auto', tone: 'bg-amber-50 text-amber-700' },
            { label: 'Type', value: preview?.paymentMethodName || 'Cash', tone: 'bg-sky-50 text-sky-700' },
            { label: 'Last paid', value: lastPayment ? `${formatInr(lastPayment.amountPaise)} · ${lastPayment.transactionDate}` : preview?.payeeId ? 'No previous payment' : 'Select payee', tone: 'bg-blue-50 text-blue-700' }
          ].map(({ label, value, tone }) => (
            <div key={label} className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs ${tone}`}>
              <span className="opacity-75">{label}</span><strong className="max-w-52 truncate font-semibold">{value}</strong>
            </div>
          ))}
        </div>

        {/* Main Quick Entry Input Container */}
        <div className="relative">
          <div className="relative flex items-center">
            <div className="absolute left-4.5 text-[#165DFF]"><Search size={22} className="stroke-[2.5]" /></div>
            <input
              ref={inputRef}
              type="text"
              name="quick-entry-input"
              aria-label="Quick payment input"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && commandPayeeSuggestions.length > 0}
              aria-controls="payee-listbox"
              aria-activedescendant={suggestionIndex >= 0 ? `payee-suggestion-${suggestionIndex}` : undefined}
              autoComplete="off"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (command.trim() && !/\d/.test(command)) setShowSuggestions(true);
              }}
              placeholder="Payee, amount, method and purpose…"
              className="w-full h-12 pl-13 pr-5 text-base font-semibold rounded-lg border border-slate-300 focus-visible:border-[#165DFF] focus-visible:ring-3 focus-visible:ring-[#165DFF]/12 bg-white text-[#111827] placeholder:text-slate-400 transition-all"
            />
          </div>

          {preview && command.trim() && (
            <div className="sr-only">
              <span>Parsed payment</span>
              <strong>{preview.payeeName} · {preview.amountPaise === null ? '—' : formatInr(preview.amountPaise)}</strong>
            </div>
          )}

          {/* New Payee or Duplicate Confirmation Banner */}
          <AnimatePresence>
            {preview && hasAmountInput && (preview.isNewPayee || preview.needsReview) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-amber-900 font-medium">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>
                    {preview.isNewPayee
                      ? preview.needsReview
                        ? `"${preview.payeeName}" is new. It will be created and sent to Review because details are missing.`
                        : `"${preview.payeeName}" is new and all payment details are complete.`
                      : preview.warnings[0]}
                  </span>
                </div>
                {preview.isNewPayee && !newPayeeConfirmed && (
                  <button
                    onClick={() => setNewPayeeConfirmed(true)}
                    className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-colors shadow-2xs"
                  >
                    + Confirm New Payee
                  </button>
                )}
                {!preview.categoryId && master?.categories.length ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-amber-800">Choose:</span>
                    {master.categories.slice(0, 6).map((category) => (
                      <button
                        type="button"
                        key={category.id}
                        onClick={() => setCommand((current) => `${current.trim()} ${category.name}`)}
                        className="rounded-md bg-white px-2 py-1 font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact dynamic assistant */}
          <AnimatePresence>
            {showSuggestions && commandPayeeSuggestions.length > 0 && (
              <motion.div
                ref={dropdownRef}
                id="payee-listbox"
                role="listbox"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.12 }}
                className="mt-2 border-t border-[#E5E7EB] pt-2"
              >
                <div className="mb-1.5 flex items-center justify-between px-1 text-xs text-[#667085]">
                  <span className="font-semibold">
                    {(command.split(/\d/)[0] ?? '').trim().split(/\s+/).length > 1
                      ? `Did you mean ${commandPayeeSuggestions[0]?.name}?`
                      : 'Matching payees'}
                  </span>
                  <span>↑↓ choose · Tab or Enter select · Esc keep new name</span>
                </div>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-4">
                  {commandPayeeSuggestions.map((payee, idx) => {
                    const isSelected = idx === suggestionIndex;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        id={`payee-suggestion-${idx}`}
                        key={payee.id}
                        onClick={() => applyPayeeSuggestion(payee)}
                        onMouseEnter={() => setSuggestionIndex(idx)}
                        className={`min-w-0 rounded-md px-3 py-2 text-left transition-colors ${
                          isSelected ? 'bg-[#E9F1FF] text-[#165DFF]' : 'hover:bg-slate-100 text-[#111827]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{payee.name}</span>
                          {payee.favourite && <Star size={12} className="shrink-0 fill-amber-400 text-amber-500" />}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[#667085]">
                          {payee.paymentCount} payments
                          {payee.defaultCategoryId ? ` · ${master?.categories.find((category) => category.id === payee.defaultCategoryId)?.name}` : ''}
                          {payee.defaultPaymentMethodId ? ` · ${master?.paymentMethods.find((method) => method.id === payee.defaultPaymentMethodId)?.displayName}` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {preview && command.trim() && !showSuggestions && (
          <div className="mt-2 flex flex-col gap-2 border-t border-[#E5E7EB] pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[#667085]">
              {lastPayment ? (
                <span>Last paid <strong className="font-semibold text-[#111827]">{formatInr(lastPayment.amountPaise)}</strong> on {lastPayment.transactionDate} via {lastPayment.paymentMethodName || 'Cash'}.</span>
              ) : preview.payeeId ? (
                <span>This is the first recorded payment for this payee.</span>
              ) : (
                <span>{hasAmountInput ? (preview.errors[0] || 'Choose a payee, then add an amount.') : 'Add an amount to continue.'}</span>
              )}
              {preview.categoryName && <span> Suggested category: <strong className="font-semibold text-[#111827]">{preview.categoryName}</strong>.</span>}
              {!preview.amountPaise && preview.payeeId && (
                <button type="button" onClick={() => setCommand((current) => `${current.trim()} 2500`)} className="ml-1 font-semibold text-[#165DFF] hover:underline">Try ₹2,500</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('payment-ledger:open-detailed-entry'))}
                className="btn btn-secondary h-8 px-3 text-xs"
              >
                Edit
              </button>
              <button onClick={handleSaveAttempt} disabled={!preview.valid || saving} className="btn btn-primary h-8 px-3 text-xs">{saving ? 'Saving…' : 'Save payment'}</button>
            </div>
          </div>
        )}
        {command.trim() && !showSuggestions && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#667085]">
            <span className="mr-1">Add:</span>
            {[
              { label: 'Cash', token: 'cash' },
              { label: 'UPI', token: 'upi' },
              { label: 'Bank', token: 'bank' },
              { label: 'Materials', token: 'materials' },
              { label: 'Wages', token: 'wages' },
              { label: 'Transport', token: 'transport' },
              { label: 'Fuel', token: 'fuel' },
              { label: 'Today', token: 'today' },
              { label: 'Yesterday', token: 'yesterday' }
            ]
              .filter((suggestion) => !command.toLocaleLowerCase('en-IN').includes(suggestion.token))
              .map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.token}
                  onClick={() => setCommand((current) => `${current.trim()} ${suggestion.token}`)}
                  className="rounded-md bg-slate-100 px-2 py-1 font-medium text-[#475467] hover:bg-[#E9F1FF] hover:text-[#165DFF]"
                >
                  {suggestion.label}
                </button>
              ))}
          </div>
        )}
        {!command.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
            <span>Try:</span>
            {[
              'Vijay Patel 2500',
              'Ramesh Kumar 1200 cash wages',
              'Mahesh Transport 5000 bank transport'
            ].map((example) => (
              <button key={example} type="button" onClick={() => setCommand(example)} className="rounded-md bg-slate-100 px-2 py-1 text-[#475467] hover:bg-[#E9F1FF] hover:text-[#165DFF]">{example}</button>
            ))}
            <span className="ml-auto">Tab completes · Enter saves</span>
          </div>
        )}
      </section>

      {/* SECTION 2: SUMMARY CARDS LAYOUT */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="ledger-card col-span-2 p-4 lg:col-span-1">
          <span className="text-xs font-semibold text-[#667085]">Total outgoing</span>
          <strong className="mt-1 block tabular-nums text-2xl text-[#111827]">{formatInr(dashboard?.totalOutgoingPaise || 0)}</strong>
          <span className="mt-1 block text-xs text-[#667085]">{dashboard?.paymentCount || 0} payments today</span>
        </div>
        <div className="ledger-card p-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#667085]"><Banknote size={14} /> Cash</span>
          <strong className="mt-1 block tabular-nums text-lg text-[#111827]">{formatInr(dashboard?.cashPaise || 0)}</strong>
          <span className="mt-1 block text-xs text-[#667085]">Physical payments</span>
        </div>
        <div className="ledger-card p-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#667085]"><CreditCard size={14} /> Bank / digital</span>
          <strong className="mt-1 block tabular-nums text-lg text-[#111827]">{formatInr(dashboard?.digitalPaise || 0)}</strong>
          <span className="mt-1 block text-xs text-[#667085]">UPI, bank and cheque</span>
        </div>
        <button onClick={() => navigate('/review')} className="ledger-card p-4 text-left hover:border-amber-300 hover:shadow-md">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#667085]"><AlertTriangle size={14} /> Needs review</span>
          <strong className={`mt-1 block tabular-nums text-lg ${dashboard?.reviewCount ? 'text-amber-700' : 'text-[#111827]'}`}>{dashboard?.reviewCount || 0}</strong>
          <span className="mt-1 block text-xs text-[#667085]">Open review queue</span>
        </button>
      </div>

      {dashboard && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-xs text-[#667085]">
          <span>Largest today <strong className="text-[#111827]">{formatInr(dashboard.largestPaymentPaise)}</strong></span>
          <span><strong className="text-[#111827]">{dashboard.uniquePayeeCount}</strong> unique payees</span>
          <span>Month <strong className="text-[#111827]">{formatInr(dashboard.monthTotalPaise)}</strong></span>
          <span>Average active day <strong className="text-[#111827]">{formatInr(dashboard.averageActiveDayPaise)}</strong></span>
        </div>
      )}

      {/* SECTION 3: OUTLAY LEDGER TABLE */}
      <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="notion-table table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[29%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Payee</th>
                <th>Category</th>
                <th className="text-center">Method</th>
                <th className="text-center">Status</th>
                <th className="text-right">Money</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EC]">
              {todaysItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667085]">
                    <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">No payments recorded today</p>
                    <p className="text-xs mt-1">Use the quick entry bar above to log a payment.</p>
                  </td>
                </tr>
              ) : (
                todaysItems.map((item) => {
                  const isVoided = item.status === 'voided';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setDrawerInitialEdit(false);
                        setSelectedTransaction(item);
                      }}
                      className="hover:bg-[#F6F8FC] cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-5 text-xs text-[#667085] font-semibold whitespace-nowrap">
                        Today, {formatTime12(item.transactionTime)}
                      </td>
                      <td className="py-3.5 px-5 overflow-hidden">
                        <div className="flex items-center gap-2.5">
                          <PayeeAvatar name={item.payeeName} size={30} />
                          <div className="min-w-0">
                            <span className="block truncate font-bold text-[#111827] group-hover:text-[#165DFF] transition-colors text-sm">
                              {item.payeeName}
                            </span>
                            {item.note && (
                              <p className="text-xs text-[#667085] line-clamp-1 mt-0.5">
                                {item.note}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {item.categoryName ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-800 rounded-md">
                            {item.categoryName}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded-md border border-amber-200">
                            Uncategorised
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="text-xs font-medium text-slate-700">{item.paymentMethodName || 'Cash'}</span>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <StatusPill
                          variant={item.status === 'voided' ? 'gray' : item.needsReview ? 'amber' : 'green'}
                          label={item.status === 'voided' ? 'Voided' : item.needsReview ? 'Review' : 'Posted'}
                        />
                      </td>
                      <td className="py-3.5 px-5 text-right font-black tabular-nums text-base text-[#111827]">
                        {isVoided && <span className="line-through text-rose-500 mr-2">{formatInr(item.amountPaise)}</span>}
                        {!isVoided && formatInr(item.amountPaise)}
                      </td>
                      <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setDrawerInitialEdit(true);
                              setSelectedTransaction(item);
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Edit transaction"
                            disabled={isVoided}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => setVoidConfirmTx(item)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Void transaction"
                            disabled={isVoided}
                          >
                            <Trash2 size={14} />
                          </button>
                          {item.needsReview && (
                            <button
                              onClick={() => {
                                setReviewTransaction(item);
                                setReviewOpen(true);
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded border border-amber-200 transition-colors cursor-pointer"
                              title="Review transaction rules"
                            >
                              Review
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals & Drawers */}
      {selectedTransaction && (
        <TransactionDrawer
          transaction={selectedTransaction}
          initialEdit={drawerInitialEdit}
          onClose={() => {
            setSelectedTransaction(null);
            setDrawerInitialEdit(false);
          }}
        />
      )}



      {reviewOpen && reviewTransaction && (
        <QuickReviewModal
          open={reviewOpen}
          onClose={() => {
            setReviewOpen(false);
            setReviewTransaction(null);
          }}
          transaction={reviewTransaction}
          master={master!}
          onSaved={handleRefresh}
        />
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={quickAddConfirmOpen}
        title={preview?.isNewPayee ? 'Create payee and record payment?' : 'Record this payment?'}
        description={duplicateConfirmed ? `${duplicateReason || 'A similar payment was recorded recently.'} Press Enter to save it anyway.` : 'Check the details, then press Enter to record.'}
        type="success"
        confirmText="Record Transaction"
        previewData={preview ? {
          'Payee': preview.payeeName,
          'Amount': preview.amountPaise === null ? '—' : formatInr(preview.amountPaise),
          'Category': preview.categoryName || 'Auto/Uncategorised',
          'Payment Method': preview.paymentMethodName || 'Cash',
          'Date': preview.transactionDate || 'Today',
          'Note': preview.note || 'None',
          ...(preview.warnings.some((warning) => warning.startsWith('Unusually high'))
            ? { 'Notice': preview.warnings.find((warning) => warning.startsWith('Unusually high')) }
            : {})
        } : undefined}
        onConfirm={async () => {
          await executeSave(preview?.isNewPayee ? true : newPayeeConfirmed, duplicateConfirmed);
        }}
        onCancel={() => setQuickAddConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={!!voidConfirmTx}
        title="Void this Transaction?"
        description="Voiding this transaction is permanent and cannot be undone. Please review details before confirming."
        type="danger"
        confirmText="Void Transaction"
        previewData={voidConfirmTx ? {
          'Payee': voidConfirmTx.payeeName,
          'Amount': formatInr(voidConfirmTx.amountPaise),
          'Category': voidConfirmTx.categoryName || 'Uncategorised',
          'Payment Method': voidConfirmTx.paymentMethodName || 'Cash',
          'Date': `Today, ${formatTime12(voidConfirmTx.transactionTime)}`,
          'Note': voidConfirmTx.note || 'None'
        } : undefined}
        onConfirm={async () => {
          if (!voidConfirmTx) return;
          try {
            await post(`/transactions/${voidConfirmTx.id}/void`, { reason: 'Voided from Today after user review' });
            await refetchTransactions();
            await refetchDashboard();
            toast.success('Transaction voided successfully');
          } catch (err: any) {
            toast.error(err.message || 'Failed to void transaction');
          } finally {
            setVoidConfirmTx(null);
          }
        }}
        onCancel={() => setVoidConfirmTx(null)}
      />
    </div>
  );
}
