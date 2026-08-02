import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LedgerTransaction, formatInr, formatTime12, post } from '../../api/client';
import { PayeeAvatar } from './PayeeAvatar';
import { StatusPill } from './StatusPill';
import { X, Calendar, Clock, CreditCard, Folder, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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
      toast.success('Transaction voided successfully');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ledger-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['activity-events'] })
      ]);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void transaction');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-stone-900/35 backdrop-blur-xs flex justify-end">
      <div
        className="w-full max-w-md bg-white h-full shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex flex-col transform transition-transform duration-200 border-l border-stone-200/50"
      >
        {/* Header */}
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-white">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Transaction Details #{transaction.id}
            </span>
            <h2 className="text-base font-bold text-stone-900 mt-0.5">
              {transaction.payeeName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Display */}
          <div className="p-6 rounded-xl bg-stone-50/70 border border-stone-200/60 text-center shadow-3xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">AMOUNT PAID</span>
            <span className="text-3xl font-black tabular-nums text-stone-950 block mt-1 leading-none">
              {formatInr(transaction.amountPaise)}
            </span>
            <div className="mt-3 flex justify-center gap-2 select-none">
              {isVoided ? (
                <StatusPill variant="amber" label="VOIDED" />
              ) : transaction.needsReview ? (
                <StatusPill variant="amber" label="Needs Review" icon={<AlertTriangle size={12} />} />
              ) : (
                <StatusPill variant="green" label="Posted" icon={<CheckCircle size={12} />} />
              )}

              {isDigital ? (
                <span className="bg-blue-50 text-blue-805 rounded-md px-2.5 py-0.5 font-bold uppercase font-mono text-[9px] border border-blue-105">
                  {transaction.paymentMethodCode}
                </span>
              ) : (
                <span className="bg-amber-50 text-amber-805 rounded-md px-2.5 py-0.5 font-bold uppercase font-mono text-[9px] border border-amber-105">
                  CASH
                </span>
              )}
            </div>
          </div>

          {/* Detailed Info Grid */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 rounded-lg border border-stone-200/60">
              <PayeeAvatar name={transaction.payeeName} size={30} />
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Payee</span>
                <p className="text-xs font-bold text-stone-900 mt-0.5">{transaction.payeeName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg border border-stone-200/60 flex items-center gap-2.5">
                <Calendar size={16} className="text-[#2563EB]" />
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Date</span>
                  <p className="text-xs font-bold text-stone-900 mt-0.5">{transaction.transactionDate}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-stone-200/60 flex items-center gap-2.5">
                <Clock size={16} className="text-[#2563EB]" />
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Time</span>
                  <p className="text-xs font-bold text-stone-900 mt-0.5">{formatTime12(transaction.transactionTime)}</p>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-stone-200/60 flex items-center gap-2.5">
              <Folder size={16} className="text-[#2563EB]" />
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Category</span>
                <p className="text-xs font-bold text-stone-900 mt-0.5">
                  {transaction.categoryName || 'Uncategorised'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-stone-200/60 flex items-center gap-2.5">
              <CreditCard size={16} className="text-[#2563EB]" />
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Payment Method</span>
                <p className="text-xs font-bold text-stone-900 mt-0.5">
                  {transaction.paymentMethodName || 'Cash'}
                </p>
              </div>
            </div>

            {transaction.note && (
              <div className="p-4 rounded-lg bg-amber-50/20 border border-amber-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Note / Details</span>
                <p className="text-xs text-stone-850 mt-1.5 whitespace-pre-wrap font-medium leading-relaxed">{transaction.note}</p>
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-stone-50 border border-stone-200/60 flex items-center justify-between text-[10px] text-stone-400 font-bold select-none">
              <span>Source: <span className="font-mono text-stone-600">{transaction.source.toUpperCase()}</span></span>
              <span>Version: {transaction.version}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-stone-100 bg-white flex items-center justify-between gap-3">
          {!isVoided ? (
            <button
              onClick={handleVoid}
              disabled={isVoiding}
              className="w-full h-10 border border-red-200 hover:border-red-300 hover:bg-red-50/50 text-red-600 text-xs font-bold rounded-lg cursor-pointer bg-white transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 size={14} />
              <span>{isVoiding ? 'Voiding...' : 'Void Transaction'}</span>
            </button>
          ) : (
            <div className="text-xs font-bold text-red-800 bg-red-50 border border-red-200/80 p-3 rounded-lg w-full text-center select-none uppercase tracking-wider">
              Transaction Voided
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
