import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LedgerTransaction, formatInr, formatTime12, patch, post } from '../../api/client';
import { PayeeAvatar } from './PayeeAvatar';
import { StatusPill } from './StatusPill';
import { X, Calendar, Clock, CreditCard, Folder, CheckCircle, AlertTriangle, Trash2, RotateCcw } from 'lucide-react';

interface TransactionDrawerProps {
  transaction: LedgerTransaction | null;
  onClose: () => void;
}

export const TransactionDrawer: React.FC<TransactionDrawerProps> = ({ transaction, onClose }) => {
  const queryClient = useQueryClient();
  const [isVoiding, setIsVoiding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!transaction) return null;

  const isVoided = transaction.status === 'voided';
  const isDigital = transaction.paymentMethodCode?.toLowerCase() !== 'cash';

  const handleVoid = async () => {
    if (!confirm('Are you sure you want to void this transaction?')) return;
    setIsVoiding(true);
    setErrorMsg(null);
    try {
      await post(`/transactions/${transaction.id}/void`, {});
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void transaction');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-200"
        style={{ boxShadow: 'var(--shadow-drawer)' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#DDE3EC] flex items-center justify-between bg-[#F6F8FC]">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Transaction Details #{transaction.id}
            </span>
            <h2 className="text-xl font-bold text-[#111827] mt-0.5">
              {transaction.payeeName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#667085] hover:text-[#111827] hover:bg-[#E9F1FF] rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Display */}
          <div className="p-6 rounded-xl bg-[#F6F8FC] border border-[#DDE3EC] text-center">
            <span className="text-xs font-semibold text-[#667085] block">AMOUNT PAID</span>
            <span className="text-4xl font-extrabold tabular-nums text-[#111827] block mt-1">
              {formatInr(transaction.amountPaise)}
            </span>
            <div className="mt-3 flex justify-center gap-2">
              {isVoided ? (
                <StatusPill variant="amber" label="VOIDED" />
              ) : transaction.needsReview ? (
                <StatusPill variant="amber" label="Needs Review" icon={<AlertTriangle size={12} />} />
              ) : (
                <StatusPill variant="green" label="Posted" icon={<CheckCircle size={12} />} />
              )}

              {isDigital ? (
                <StatusPill variant="blue" label={transaction.paymentMethodName || 'Digital/Bank'} />
              ) : (
                <StatusPill variant="gray" label="Cash" />
              )}
            </div>
          </div>

          {/* Detailed Info Grid */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-[#DDE3EC]">
              <PayeeAvatar name={transaction.payeeName} size={36} />
              <div>
                <span className="text-xs font-medium text-[#667085]">Payee</span>
                <p className="text-sm font-semibold text-[#111827]">{transaction.payeeName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-[#DDE3EC] flex items-center gap-2.5">
                <Calendar size={18} className="text-[#165DFF]" />
                <div>
                  <span className="text-xs font-medium text-[#667085]">Date</span>
                  <p className="text-sm font-semibold text-[#111827]">{transaction.transactionDate}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-[#DDE3EC] flex items-center gap-2.5">
                <Clock size={18} className="text-[#165DFF]" />
                <div>
                  <span className="text-xs font-medium text-[#667085]">Time</span>
                  <p className="text-sm font-semibold text-[#111827]">{formatTime12(transaction.transactionTime)}</p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-[#DDE3EC] flex items-center gap-2.5">
              <Folder size={18} className="text-[#165DFF]" />
              <div>
                <span className="text-xs font-medium text-[#667085]">Category</span>
                <p className="text-sm font-semibold text-[#111827]">
                  {transaction.categoryName || 'Uncategorised'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-[#DDE3EC] flex items-center gap-2.5">
              <CreditCard size={18} className="text-[#165DFF]" />
              <div>
                <span className="text-xs font-medium text-[#667085]">Payment Method</span>
                <p className="text-sm font-semibold text-[#111827]">
                  {transaction.paymentMethodName || 'Cash'}
                </p>
              </div>
            </div>

            {transaction.note && (
              <div className="p-4 rounded-lg bg-amber-50/40 border border-amber-100">
                <span className="text-xs font-semibold text-amber-800">Note / Details</span>
                <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{transaction.note}</p>
              </div>
            )}

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs text-[#667085]">
              <span>Source: <strong className="font-mono text-slate-700">{transaction.source.toUpperCase()}</strong></span>
              <span>Version: {transaction.version}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#DDE3EC] bg-white flex items-center justify-between gap-3">
          {!isVoided ? (
            <button
              onClick={handleVoid}
              disabled={isVoiding}
              className="btn btn-secondary w-full text-rose-600 hover:bg-rose-50 hover:border-rose-200"
            >
              <Trash2 size={16} />
              <span>{isVoiding ? 'Voiding...' : 'Void Transaction'}</span>
            </button>
          ) : (
            <div className="text-xs font-semibold text-rose-600 bg-rose-50 p-3 rounded-lg w-full text-center">
              Transaction Voided
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
