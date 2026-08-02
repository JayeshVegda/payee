import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Star
} from 'lucide-react';
import { toast } from 'sonner';
import DetailedEntryDrawer from '../components/payment-entry/DetailedEntryDrawer';
import QuickReviewModal from '../components/review/QuickReviewModal';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { StatusPill } from '../components/common/StatusPill';
import { TransactionDrawer } from '../components/common/TransactionDrawer';

export default function TodayPage() {
  const [command, setCommand] = useState('');
  const [preview, setPreview] = useState<QuickPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newPayeeConfirmed, setNewPayeeConfirmed] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  const [detailedOpen, setDetailedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);
  const [reviewTransaction, setReviewTransaction] = useState<{
    id: number;
    updatedAt: string;
    amountPaise?: number;
    payeeName?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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

  const { data: lastPaymentData } = useQuery<{ items: LedgerTransaction[] }>({
    queryKey: ['payee-last-payment', preview?.payeeId],
    queryFn: () => api<{ items: LedgerTransaction[] }>(`/transactions?payeeId=${preview!.payeeId}&pageSize=1`),
    enabled: Boolean(preview?.payeeId)
  });
  const lastPayment = lastPaymentData?.items[0];

  const handleRefresh = async () => {
    await Promise.all([refetchDashboard(), refetchMaster(), refetchTransactions()]);
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
    setSuggestionIndex(0);
    
    if (!command.trim()) {
      setPreview(null);
      setNewPayeeConfirmed(false);
      setDuplicateConfirmed(false);
      setShowSuggestions(false);
      return;
    }

    const normalizedCommand = command.trim().toLocaleLowerCase('en-IN');
    const exactPayee = master?.payees.some((payee) =>
      [payee.name, ...payee.aliases].some(
        (name) => name.toLocaleLowerCase('en-IN') === normalizedCommand
      )
    );
    setShowSuggestions(!/\d/.test(command) && !exactPayee);

    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await post<QuickPreview>('/quick-entry/preview', { command });
        setPreview(res);
      } catch {
        setPreview(null);
      }
    }, 120);

    return () => window.clearTimeout(previewTimerRef.current);
  }, [command, master?.payees]);

  const executeSave = async (payeeConfirmed: boolean, dupConfirmed: boolean) => {
    if (!command.trim() || saving) return;
    setSaving(true);
    try {
      const res = await post<LedgerTransaction>('/quick-entry/save', { command });

      toast.success(`Logged ₹${(res.amountPaise / 100).toLocaleString('en-IN')} paid to ${res.payeeName}`);
      setCommand('');
      setPreview(null);
      setNewPayeeConfirmed(false);
      setDuplicateConfirmed(false);
      setShowSuggestions(false);
      await Promise.all([refetchDashboard(), refetchTransactions(), refetchMaster()]);

      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && commandPayeeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % commandPayeeSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + commandPayeeSuggestions.length) % commandPayeeSuggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = commandPayeeSuggestions[suggestionIndex];
        if (selected) applyPayeeSuggestion(selected);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // If suggestions are open and user presses Enter before typing amount, select the payee
      if (showSuggestions && commandPayeeSuggestions.length > 0 && !/\d/.test(command)) {
        const selected = commandPayeeSuggestions[suggestionIndex];
        if (selected) {
          applyPayeeSuggestion(selected);
          return;
        }
      }

      if (preview?.errors.length) return;
      if (preview?.isNewPayee && !newPayeeConfirmed) {
        setNewPayeeConfirmed(true);
        return;
      }
      if (preview?.warnings.some((w) => w.includes('duplicate')) && !duplicateConfirmed) {
        setDuplicateConfirmed(true);
        return;
      }
      executeSave(newPayeeConfirmed, duplicateConfirmed);
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
      <section className="relative rounded-2xl border border-[#DDE3EC] bg-white px-4 py-4 shadow-[var(--shadow-card)] md:px-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-[#111827]">Record payment</h1>
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button className="rounded-md bg-white px-3 py-1.5 text-[#165DFF] shadow-xs">Quick entry</button>
            <button onClick={() => setDetailedOpen(true)} className="rounded-md px-3 py-1.5 text-[#667085] hover:text-[#111827]">Form</button>
          </div>
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

          {/* New Payee or Duplicate Confirmation Banner */}
          <AnimatePresence>
            {preview && command.trim() && (preview.isNewPayee || preview.warnings.length > 0) && (
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
                      ? `"${preview.payeeName}" is not in your payees list yet. Press Enter again to create it automatically.`
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
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.12 }}
                className="mt-2 border-t border-[#E5E7EB] pt-2"
              >
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-4">
                  {commandPayeeSuggestions.map((payee, idx) => {
                    const isSelected = idx === suggestionIndex;
                    return (
                      <button
                        type="button"
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
                <span>{preview.errors[0] || 'Choose a payee, then add an amount.'}</span>
              )}
              {preview.categoryName && <span> Suggested category: <strong className="font-semibold text-[#111827]">{preview.categoryName}</strong>.</span>}
              {!preview.amountPaise && preview.payeeId && (
                <button type="button" onClick={() => setCommand((current) => `${current.trim()} 2500`)} className="ml-1 font-semibold text-[#165DFF] hover:underline">Try ₹2,500</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDetailedOpen(true)} className="btn btn-secondary h-8 px-3 text-xs">Edit</button>
              <button onClick={() => executeSave(newPayeeConfirmed, duplicateConfirmed)} disabled={!preview.valid || saving} className="btn btn-primary h-8 px-3 text-xs">{saving ? 'Saving…' : 'Save payment'}</button>
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
        <button onClick={() => window.location.assign('/review')} className="ledger-card p-4 text-left hover:border-amber-300 hover:shadow-md">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#667085]"><AlertTriangle size={14} /> Needs review</span>
          <strong className={`mt-1 block tabular-nums text-lg ${dashboard?.reviewCount ? 'text-amber-700' : 'text-[#111827]'}`}>{dashboard?.reviewCount || 0}</strong>
          <span className="mt-1 block text-xs text-[#667085]">Open review queue</span>
        </button>
      </div>

      {/* SECTION 3: OUTLAY LEDGER TABLE */}
      <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#DDE3EC] flex items-center justify-between bg-white">
          <div>
            <h2 className="text-base font-bold text-[#111827]">Today’s transactions</h2>
            <p className="text-xs text-[#667085] mt-0.5">
              {todaysItems.length} transactions recorded for {todayDate}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F6F8FC] border-b border-[#DDE3EC] text-xs uppercase font-bold text-[#667085]">
              <tr>
                <th className="py-3 px-5 text-right">Amount</th>
                <th className="py-3 px-5">Time</th>
                <th className="py-3 px-5">Payee</th>
                <th className="py-3 px-5">Category</th>
                <th className="py-3 px-5">Method</th>
                <th className="py-3 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EC]">
              {todaysItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#667085]">
                    <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">No payments recorded today</p>
                    <p className="text-xs mt-1">Use the quick entry bar above to log a payment.</p>
                  </td>
                </tr>
              ) : (
                todaysItems.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedTransaction(item)}
                      className="hover:bg-[#F6F8FC] cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 text-right font-bold text-sm text-[#111827] tabular-nums">
                        {formatInr(item.amountPaise)}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#667085] font-medium whitespace-nowrap">
                        {formatTime12(item.transactionTime)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <PayeeAvatar name={item.payeeName} size={30} />
                          <div>
                            <span className="font-bold text-[#111827] group-hover:text-[#165DFF] transition-colors">
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
                      <td className="py-3 px-4">
                        {item.categoryName ? (
                          <span className="text-sm text-slate-700">{item.categoryName}</span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Uncategorised
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-700">{item.paymentMethodName || 'Cash'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill
                          variant={item.status === 'voided' ? 'gray' : item.needsReview ? 'amber' : 'green'}
                          label={item.status === 'voided' ? 'Voided' : item.needsReview ? 'Review' : 'Posted'}
                        />
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
          onClose={() => setSelectedTransaction(null)}
        />
      )}

      {detailedOpen && (
        <DetailedEntryDrawer
          open={detailedOpen}
          onClose={() => setDetailedOpen(false)}
          master={master!}
          onSaved={handleRefresh}
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
    </div>
  );
}
