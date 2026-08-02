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
import { Check, Inbox, RefreshCw, AlertTriangle, Sparkles, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { StatusPill } from '../components/common/StatusPill';

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
    <div className="space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Needs review</h1>
          <p className="mt-1 text-sm text-[#667085]">Complete missing details for {items.length} payments.</p>
        </div>

        <div className="flex items-center gap-3">
          {rememberedCount > 0 && (
            <div className="px-3 py-1.5 bg-[#E9F1FF] border border-[#165DFF]/30 text-[#165DFF] rounded-full text-xs font-bold flex items-center gap-1.5">
              <Sparkles size={14} />
              <span>{rememberedCount} defaults saved</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            className="btn btn-secondary h-10 px-3 text-[#667085] hover:text-[#111827]"
            title="Refresh review inbox"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {items.length > 0 && (
            <button
              onClick={handleBulkResolve}
              disabled={bulkProcessing}
              className="btn btn-primary h-10 px-4 gap-2 bg-[#F79009] hover:bg-[#D97706] border-none shadow-xs"
            >
              <CheckCircle2 size={16} />
              <span>{bulkProcessing ? 'Processing...' : 'Resolve all ready items'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Review List */}
      <div className="overflow-hidden rounded-2xl border border-[#DDE3EC] bg-white shadow-[var(--shadow-card)] divide-y divide-[#DDE3EC]">
        {items.length === 0 ? (
          <div className="p-12 text-center text-[#667085]">
            <Inbox size={40} className="mx-auto mb-3 text-emerald-500" />
            <h3 className="text-lg font-bold text-[#111827]">Review inbox is empty</h3>
            <p className="text-xs mt-1 text-[#667085]">
              All incoming payments have been categorized and confirmed. Great work!
            </p>
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
                className={`bg-white px-4 py-3 transition-colors hover:bg-slate-50 ${isAged ? 'border-l-2 border-l-[#F79009]' : ''}`}
              >
                <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(240px,1fr)_130px_minmax(390px,auto)]">
                  {/* Left: Transaction Info */}
                  <div className="flex min-w-0 items-center gap-3">
                    <PayeeAvatar name={item.payeeName} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-[#111827]">{item.payeeName}</span>
                        {isAged && (
                          <span className="text-[11px] font-medium text-amber-700">· over 7 days</span>
                        )}
                      </div>

                      <div className="mt-0.5 text-xs text-[#667085]">
                        {item.transactionDate} · {formatTime12(item.transactionTime)} · {item.source.charAt(0).toUpperCase() + item.source.slice(1)}
                      </div>

                      {item.note && (
                        <p className="mt-0.5 truncate text-xs text-slate-600">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Middle: Right-Aligned Amount */}
                  <div className="text-left lg:text-right">
                    <span className="text-base font-bold tabular-nums text-[#111827]">
                      {formatInr(item.amountPaise)}
                    </span>
                  </div>

                  {/* Right: Selectors & Resolve Action (Disabled until category selected) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Category Selector */}
                    <div className="w-full sm:w-40">
                      <select
                        value={draft.categoryId}
                        onChange={(e) => handleDraftChange(item.id, 'categoryId', e.target.value)}
                        aria-label={`Category for ${item.payeeName}`}
                        className={`form-input text-xs font-medium h-9 ${
                          !draft.categoryId ? 'border-amber-400 bg-amber-50/50' : ''
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
                        className="form-input text-xs font-medium h-9"
                      >
                        {master?.paymentMethods.map((m) => (
                          <option key={m.id} value={m.id.toString()}>
                            {m.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Promoted Remember Mapping */}
                    <div className="flex items-center gap-1.5 self-center">
                      <input
                        type="checkbox"
                        id={`rem-${item.id}`}
                        checked={draft.remember}
                        onChange={(e) => handleDraftChange(item.id, 'remember', e.target.checked)}
                        className="w-4 h-4 rounded border-[#DDE3EC] text-[#165DFF]"
                      />
                      <label htmlFor={`rem-${item.id}`} className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                        Use next time
                      </label>
                    </div>

                    {/* Resolve Button (Section 4.4 Spec: Disabled until category chosen) */}
                    <button
                      onClick={() => handleResolve(item)}
                      disabled={!isValid || isResolving}
                      className={`btn h-9 px-4 gap-1.5 text-xs font-bold transition-all ${
                        isValid
                          ? 'btn-primary bg-[#00B96B] hover:bg-[#009E5B]'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      }`}
                      title={!isValid ? 'Select a category to enable resolve' : 'Confirm and resolve payment'}
                    >
                      <Check size={16} />
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
