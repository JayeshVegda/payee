import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  patch,
  formatInr,
  formatTime12,
  LedgerTransaction,
  MasterData
} from '../api/client';
import { Check, Inbox, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PayeeAvatar } from '../components/common/PayeeAvatar';

interface Page {
  items: LedgerTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

type Draft = {
  categoryId: string;
  methodId: string;
  remember: boolean;
};

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<number, boolean>>({});
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const {
    data: dataPage,
    isLoading: pageLoading,
    refetch: refetchPage
  } = useQuery<Page>({
    queryKey: ['review-transactions'],
    queryFn: () => api<Page>('/transactions?reviewOnly=true&pageSize=100')
  });

  const { data: master, isLoading: masterLoading } = useQuery<MasterData>({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data')
  });

  const items = dataPage?.items || [];
  const loading = pageLoading || masterLoading;

  // Count remembered payee mappings count
  const rememberedCount = useMemo(() => {
    return master?.payees.filter((p) => p.defaultCategoryId !== null).length || 0;
  }, [master]);

  // Initialize draft values when items or master changes
  useEffect(() => {
    if (items.length > 0 && master) {
      const defaultCashId = master.paymentMethods.find((m) => m.code === 'cash')?.id.toString() || '';
      
      const initialDrafts = Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            categoryId: item.categoryId?.toString() || '',
            methodId: item.paymentMethodId?.toString() || defaultCashId,
            remember: false
          }
        ])
      );
      setDrafts(initialDrafts);
    }
  }, [items, master]);

  const handleRefresh = async () => {
    await refetchPage();
    toast.success('Review inbox refreshed');
  };

  const handleDraftChange = <K extends keyof Draft>(txId: number, field: K, value: Draft[K]) => {
    setDrafts((prev) => ({
      ...prev,
      [txId]: {
        ...prev[txId]!,
        [field]: value
      }
    }));
  };

  const handleResolve = async (item: LedgerTransaction) => {
    const draft = drafts[item.id];
    if (!draft || !draft.categoryId || !draft.methodId) return;

    setResolvingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      await patch(`/transactions/${item.id}`, {
        categoryId: Number(draft.categoryId),
        paymentMethodId: Number(draft.methodId),
        needsReview: false,
        expectedUpdatedAt: item.updatedAt,
        source: 'web'
      });

      if (draft.remember) {
        await patch(`/payees/${item.payeeId}`, {
          defaultCategoryId: Number(draft.categoryId),
          defaultPaymentMethodId: Number(draft.methodId)
        });
      }

      toast.success(`Resolved payment for ${item.payeeName}`);
      await Promise.all([
        refetchPage(),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      ]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to resolve transaction');
    } finally {
      setResolvingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Bulk resolve all ready transactions (Section 4.4 Spec)
  const handleBulkResolve = async () => {
    const readyItems = items.filter((item) => drafts[item.id]?.categoryId && drafts[item.id]?.methodId);
    if (readyItems.length === 0) {
      toast.error('No items have a category selected yet');
      return;
    }

    setBulkProcessing(true);
    let resolvedCount = 0;
    try {
      for (const item of readyItems) {
        const draft = drafts[item.id]!;
        await patch(`/transactions/${item.id}`, {
          categoryId: Number(draft.categoryId),
          paymentMethodId: Number(draft.methodId),
          needsReview: false,
          expectedUpdatedAt: item.updatedAt,
          source: 'web'
        });
        if (draft.remember) {
          await patch(`/payees/${item.payeeId}`, {
            defaultCategoryId: Number(draft.categoryId),
            defaultPaymentMethodId: Number(draft.methodId)
          });
        }
        resolvedCount++;
      }

      toast.success(`Bulk resolved ${resolvedCount} transactions!`);
      await Promise.all([
        refetchPage(),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      ]);
    } catch {
      toast.error('Error occurred during bulk resolution');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Age calculation helper
  const isOlderThan7Days = (dateStr: string) => {
    const txDate = new Date(dateStr);
    const now = new Date();
    const diffDays = (now.getTime() - txDate.getTime()) / (1000 * 3600 * 24);
    return diffDays > 7;
  };

  return (
    <div className="space-y-8">
      {/* Title & Actions */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/40 pb-6">
        <div>
          <h1 className="sr-only">Review Inbox</h1>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-sans">
            Review Queue
          </h2>
          <p className="text-xs text-stone-500 mt-1 font-medium">
            Review missing details and categorize {items.length} pending payments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {rememberedCount > 0 && (
            <div className="px-3.5 py-1.5 bg-[#E9F1FF] border border-[#165DFF]/15 text-[#2563EB] rounded-full text-[10px] font-bold flex items-center gap-1.5 select-none">
              <Sparkles size={12} />
              <span>{rememberedCount} defaults saved</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100/60 border border-stone-200 rounded-lg transition-all duration-150 cursor-pointer bg-white"
            title="Refresh review inbox"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {items.length > 0 && (
            <button
              onClick={handleBulkResolve}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#F79009] hover:bg-[#E28007] text-white rounded-lg shadow-sm hover:shadow transition-all duration-150 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={14} />
              <span>{bulkProcessing ? 'Processing...' : 'Resolve all ready items'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Review List */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.02)] border border-stone-100/50 divide-y divide-stone-100/50 overflow-hidden">
        {items.length === 0 ? (
          <div className="py-20 text-center text-stone-400 space-y-4">
            <span className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </span>
            <div>
              <strong className="block text-stone-850 font-bold text-sm">Review inbox is empty</strong>
              <p className="text-xs text-stone-500 mt-1">
                All incoming payments have been categorized and confirmed. Great work!
              </p>
            </div>
          </div>
        ) : (
          items.map((item) => {
            const draft = drafts[item.id] || { categoryId: '', methodId: '', remember: false };
            const isValid = Boolean(draft.categoryId && draft.methodId);
            const isResolving = Boolean(resolvingIds[item.id]);
            const isAged = isOlderThan7Days(item.transactionDate);

            return (
              <div
                key={item.id}
                className={`p-5 transition-colors hover:bg-stone-50/40 ${
                  isAged ? 'border-l-4 border-l-amber-500/80' : ''
                }`}
              >
                <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(240px,1fr)_130px_minmax(390px,auto)]">
                  {/* Left: Transaction Info */}
                  <div className="flex min-w-0 items-center gap-3">
                    <PayeeAvatar name={item.payeeName} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold text-stone-900 text-sm leading-normal">{item.payeeName}</span>
                        {isAged && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/60 text-[9px] font-bold text-amber-800 uppercase tracking-wide shrink-0">
                            over 7 days
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-[10px] font-bold text-stone-450 uppercase">
                        {item.transactionDate} · {formatTime12(item.transactionTime)} · {item.source}
                      </div>

                      {item.note && (
                        <p className="mt-1 text-xs text-stone-500 truncate max-w-[280px]">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Middle: Right-Aligned Amount */}
                  <div className="text-left lg:text-right font-black text-stone-950 text-base tabular-nums">
                    {formatInr(item.amountPaise)}
                  </div>

                  {/* Right: Selectors & Resolve Action */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 select-none">
                    {/* Category Selector */}
                    <div className="w-full sm:w-40">
                      <select
                        value={draft.categoryId}
                        onChange={(e) => handleDraftChange(item.id, 'categoryId', e.target.value)}
                        aria-label={`Category for ${item.payeeName}`}
                        className={`w-full h-9 px-3 text-xs font-semibold rounded-lg border bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all ${
                          !draft.categoryId 
                            ? 'border-amber-300 bg-amber-50/20 text-amber-900 focus:border-amber-400' 
                            : 'border-stone-200 text-stone-900'
                        }`}
                      >
                        <option value="">Category…</option>
                        {master?.categories.map((c) => (
                          <option key={c.id} value={c.id.toString()}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Method Selector */}
                    <div className="w-full sm:w-32">
                      <select
                        value={draft.methodId}
                        onChange={(e) => handleDraftChange(item.id, 'methodId', e.target.value)}
                        aria-label={`Payment method for ${item.payeeName}`}
                        className="w-full h-9 px-3 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                      >
                        {master?.paymentMethods.map((m) => (
                          <option key={m.id} value={m.id.toString()}>
                            {m.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Promoted Remember Mapping */}
                    <div className="flex items-center gap-2 self-center shrink-0">
                      <input
                        type="checkbox"
                        id={`rem-${item.id}`}
                        checked={draft.remember}
                        onChange={(e) => handleDraftChange(item.id, 'remember', e.target.checked)}
                        className="w-4 h-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor={`rem-${item.id}`} className="text-xs font-semibold text-stone-500 cursor-pointer select-none">
                        Use next time
                      </label>
                    </div>

                    {/* Resolve Button */}
                    <button
                      onClick={() => handleResolve(item)}
                      disabled={!isValid || isResolving}
                      className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all border-none shrink-0 ${
                        isValid
                          ? 'bg-[#00B96B] hover:bg-[#009E5B] text-white shadow-3xs cursor-pointer'
                          : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                      }`}
                      title={!isValid ? 'Select a category to enable resolve' : 'Confirm and resolve payment'}
                    >
                      <Check size={14} />
                      <span>{isResolving ? 'Resolving...' : 'Resolve'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
