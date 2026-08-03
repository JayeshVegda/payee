import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr, post } from '../api/client';
import { Edit3, Trash2, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { TransactionDrawer } from '../components/common/TransactionDrawer';
import { ConfirmModal } from '../components/common/ConfirmModal';

interface Event {
  id: number;
  action: string;
  changedAt: string;
  source: string;
  transactionId: number;
  amountPaise: number;
  payeeName: string;
}

export default function ActivityPage() {
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: events = [], refetch } = useQuery<Event[]>({
    queryKey: ['activity-events'],
    queryFn: () => api<Event[]>('/activity?limit=200')
  });

  const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
  const visibleEvents = useMemo(() => events.slice((page - 1) * pageSize, page * pageSize), [events, page]);

  const handleEdit = async (transactionId: number) => {
    try {
      const tx = await api<any>(`/transactions/${transactionId}`);
      setSelectedTx(tx);
    } catch {
      toast.error('Failed to load transaction details');
    }
  };


  return (
    <div className="space-y-4">
      <h1 className="sr-only">Activity</h1>
      {/* Flat Simple Table (Compact one-liner) */}
      <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F6F8FC] border-b border-[#DDE3EC] text-xs uppercase font-bold text-[#667085]">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Payee</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EC]">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#667085]">
                    <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-base">No activity logs found</p>
                  </td>
                </tr>
              ) : (
                visibleEvents.map((event) => {
                  const isVoid = event.action === 'void' || event.action === 'voided';
                  const isCorrect = event.action === 'correct' || event.action === 'corrected';
                  const localTime = new Date(event.changedAt).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Asia/Kolkata'
                  });

                  return (
                    <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4 text-xs font-medium text-[#667085] whitespace-nowrap">
                        {localTime}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                            isVoid
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isCorrect
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {event.action === 'create' || event.action === 'created' ? 'Created' : isCorrect ? 'Edited' : isVoid ? 'Voided' : event.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">
                        {event.payeeName}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-800 text-sm whitespace-nowrap">
                        {isVoid && <span className="line-through text-rose-500 mr-2">{formatInr(event.amountPaise)}</span>}
                        {!isVoid && formatInr(event.amountPaise)}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-mono uppercase text-[#667085]">
                        {event.source}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(event.transactionId)}
                            className="p-1 text-slate-500 hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Edit transaction"
                            disabled={isVoid}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmTx(event)}
                            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Void transaction"
                            disabled={isVoid}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {events.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#DDE3EC] bg-[#FAFBFD] px-4 py-3 text-xs text-[#667085]">
            <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, events.length)} of {events.length} changes</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:border-[#165DFF] hover:text-[#165DFF] disabled:opacity-40" aria-label="Previous activity page"><ChevronLeft size={15} /></button>
              <span className="min-w-20 text-center font-semibold text-[#344054]">Page {page} of {pageCount}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:border-[#165DFF] hover:text-[#165DFF] disabled:opacity-40" aria-label="Next activity page"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Detail Drawer */}
      <TransactionDrawer
        transaction={selectedTx}
        initialEdit={true}
        onClose={() => {
          setSelectedTx(null);
          refetch();
        }}
      />

      {/* Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmTx}
        title="Void this Transaction?"
        description="Voiding this transaction is permanent. Review details below before continuing."
        type="danger"
        confirmText="Void Transaction"
        previewData={deleteConfirmTx ? {
          'Transaction ID': `#${deleteConfirmTx.transactionId}`,
          'Payee': deleteConfirmTx.payeeName || 'Unknown',
          'Amount': formatInr(deleteConfirmTx.amountPaise || 0),
          'Action Date': deleteConfirmTx.changedAt ? new Date(deleteConfirmTx.changedAt).toLocaleString('en-IN') : 'Unknown'
        } : undefined}
        onConfirm={async () => {
          if (!deleteConfirmTx) return;
          try {
            await post(`/transactions/${deleteConfirmTx.transactionId}/void`, { reason: 'Voided from Activity Log' });
            toast.success('Transaction voided successfully');
            refetch();
          } catch (err: any) {
            toast.error(err.message || 'Failed to void transaction');
          } finally {
            setDeleteConfirmTx(null);
          }
        }}
        onCancel={() => setDeleteConfirmTx(null)}
      />
    </div>
  );
}
