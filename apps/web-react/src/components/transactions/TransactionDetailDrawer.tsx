import React, { useEffect, useState } from 'react';
import { api, formatInr, formatTime12, LedgerTransaction } from '../../api/client';
import { X } from 'lucide-react';

interface TransactionDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  transaction?: LedgerTransaction | null;
  transactionId?: number | null;
}

interface AuditEntry {
  id: number;
  action: string;
  changedAt: string;
  changeSource: string;
}

export default function TransactionDetailDrawer({
  open,
  onClose,
  transaction,
  transactionId
}: TransactionDetailDrawerProps) {
  const [item, setItem] = useState<LedgerTransaction | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = transaction?.id ?? transactionId;
    if (!id || !open) return;

    setItem(transaction || null);
    setAudit([]);
    setError('');

    const loadDetails = async () => {
      try {
        const [loadedItem, loadedAudit] = await Promise.all([
          transaction
            ? Promise.resolve(transaction)
            : api<LedgerTransaction>(`/transactions/${id}`),
          api<AuditEntry[]>(`/transactions/${id}/audit`)
        ]);
        setItem(loadedItem);
        setAudit(loadedAudit);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Details could not be loaded');
      }
    };

    void loadDetails();
  }, [transaction, transactionId, open]);

  // Support listening to close-all-overlays event
  useEffect(() => {
    const handleCloseAll = () => onClose();
    window.addEventListener('close-all-overlays', handleCloseAll);
    return () => window.removeEventListener('close-all-overlays', handleCloseAll);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col z-10 border-l border-ledger-border animate-in slide-in-from-right duration-200">
        <header className="flex items-center justify-between px-6 py-4 border-b border-ledger-border">
          <div>
            <p className="text-[10px] uppercase font-bold text-ledger-muted tracking-wider">
              Payment details
            </p>
            <h2 className="text-lg font-bold text-ledger-ink leading-tight">
              {item?.payeeName ?? 'Loading...'}
            </h2>
            <p className="text-xs text-ledger-muted mt-0.5">
              {item
                ? `${item.transactionDate} at ${formatTime12(item.transactionTime)}`
                : 'Fetching record...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-ledger-selection text-ledger-muted hover:text-ledger-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {error && (
          <div className="mx-6 mt-4 p-3 text-xs bg-ledger-review/10 border border-ledger-review/20 text-ledger-review rounded-md">
            {error}
          </div>
        )}

        {item && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-baseline justify-between p-4 bg-ledger-workspace/30 border border-ledger-border rounded-xl">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-semibold text-ledger-muted block">
                  Amount paid
                </span>
                <strong className="text-2xl font-mono text-ledger-ink tracking-tight tabular-nums">
                  {formatInr(item.amountPaise)}
                </strong>
              </div>
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                  item.paymentMethodCode === 'cash'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-ledger-blue/10 text-ledger-blue border border-ledger-blue/20'
                }`}
              >
                {item.paymentMethodName ?? 'Needs review'}
              </span>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                Overview
              </h3>
              <dl className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div>
                  <dt className="text-ledger-muted font-medium mb-0.5">Payee</dt>
                  <dd className="text-ledger-ink font-semibold">{item.payeeName}</dd>
                </div>
                <div>
                  <dt className="text-ledger-muted font-medium mb-0.5">Category</dt>
                  <dd className="text-ledger-ink font-semibold font-sans">
                    {item.categoryName ?? 'Not selected'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ledger-muted font-medium mb-0.5">Status</dt>
                  <dd className="text-ledger-ink font-semibold capitalize font-sans">
                    {item.status} {item.needsReview && ' · Needs review'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ledger-muted font-medium mb-0.5">Source</dt>
                  <dd className="text-ledger-ink font-semibold uppercase">{item.source}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                Purpose or note
              </h3>
              <p className="text-xs text-ledger-muted bg-ledger-workspace/30 p-3 rounded-lg border border-ledger-border/40 italic">
                {item.note ?? 'No note was entered for this payment.'}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                Audit Trail
              </h3>
              <div className="space-y-3 pl-1">
                {audit.map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-xs relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-ledger-blue mt-1.5 shrink-0" />
                    <div className="space-y-0.5">
                      <strong className="text-ledger-ink font-semibold capitalize">
                        {entry.action}
                      </strong>
                      <div className="text-[10px] text-ledger-muted">
                        {new Date(entry.changedAt).toLocaleString('en-IN')} · Source:{' '}
                        <span className="uppercase">{entry.changeSource}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {audit.length === 0 && (
                  <p className="text-xs text-ledger-muted italic">No audit events found.</p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-center text-ledger-muted pt-4 border-t border-ledger-border/40">
              Open this payment in <strong className="text-ledger-blue">Ledger</strong> to correct
              or void it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
