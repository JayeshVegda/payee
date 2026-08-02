import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  patch,
  formatInr,
  formatTime12,
  LedgerTransaction,
  MasterData
} from '../api/client';
import { Check, Inbox, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<number, boolean>>({});

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

      toast.success('Review completed', {
        description: draft.remember
          ? 'Payee defaults remembered.'
          : 'Only this payment was changed.'
      });

      await refetchPage();
      // Notify navigation parent to refetch badge count
      window.dispatchEvent(new CustomEvent('dashboard-changed'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Review could not be completed');
    } finally {
      setResolvingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink font-sans">
            Review Inbox
          </h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {/* Summary Box */}
      <section className="ledger-card p-4 border-ledger-border shadow-xs bg-white flex items-center gap-3 text-xs font-semibold text-ledger-ink">
        <Inbox className="w-5 h-5 text-ledger-blue" />
        <strong>{items.length}</strong>
        <span className="text-ledger-muted font-medium">
          {items.length === 1 ? 'payment needs' : 'payments need'} operational validation.
        </span>
      </section>

      {/* Inbox List */}
      <section className="space-y-4">
        {items.map((item) => {
          const draft = drafts[item.id];
          const isResolving = resolvingIds[item.id] || false;

          return (
            <article
              key={item.id}
              className="ledger-card p-5 border-ledger-border shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6 bg-white"
            >
              {/* Left Identity details */}
              <div className="space-y-2 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] text-ledger-muted font-mono font-medium">
                    {item.transactionDate} · {formatTime12(item.transactionTime)}
                  </span>
                  {item.source && (
                    <span className="text-[9px] uppercase font-bold text-ledger-muted bg-ledger-workspace border border-ledger-border/80 px-1 rounded">
                      {item.source}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ledger-ink leading-tight">
                    {item.payeeName}
                  </h3>
                  <strong className="text-lg font-mono text-ledger-ink block tracking-tight mt-1 tabular-nums">
                    {formatInr(item.amountPaise)}
                  </strong>
                </div>
                <p className="text-xs text-ledger-muted leading-relaxed italic">
                  {item.note || 'No purpose entered.'}
                </p>
              </div>

              {/* Right forms select defaults */}
              {draft && master && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 text-xs font-medium shrink-0">
                  <label className="flex flex-col gap-1">
                    <span className="text-ledger-muted text-[11px]">Category</span>
                    <select
                      value={draft.categoryId}
                      onChange={(e) => handleDraftChange(item.id, 'categoryId', e.target.value)}
                      className="form-input py-1.5 text-xs w-full sm:w-44"
                      disabled={isResolving}
                    >
                      <option value="">Choose category...</option>
                      {master.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-ledger-muted text-[11px]">Method</span>
                    <select
                      value={draft.methodId}
                      onChange={(e) => handleDraftChange(item.id, 'methodId', e.target.value)}
                      className="form-input py-1.5 text-xs w-full sm:w-36"
                      disabled={isResolving}
                    >
                      {master.paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center gap-4 h-[34px] sm:h-auto">
                    <label className="flex items-center gap-2 cursor-pointer text-ledger-ink">
                      <input
                        type="checkbox"
                        checked={draft.remember}
                        onChange={(e) => handleDraftChange(item.id, 'remember', e.target.checked)}
                        className="rounded border-ledger-border text-ledger-blue focus:ring-ledger-blue"
                        disabled={isResolving}
                      />
                      <span className="text-[11px]">Remember mapping</span>
                    </label>

                    <button
                      onClick={() => void handleResolve(item)}
                      disabled={!draft.categoryId || !draft.methodId || isResolving}
                      className="btn btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1 hover:shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isResolving ? 'Saving...' : 'Resolve'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {items.length === 0 && (
          <div className="py-16 text-center text-ledger-muted space-y-3 bg-white border border-ledger-border rounded-xl">
            <Check className="w-8 h-8 text-emerald-600 mx-auto bg-emerald-50 p-1.5 rounded-full" />
            <strong className="block text-ledger-ink font-semibold text-sm">Inbox Cleared</strong>
            <p className="text-xs">
              All transactions have valid categorizations. New payees will appear here for audit review.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
