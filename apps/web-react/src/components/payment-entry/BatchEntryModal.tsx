import React, { useState, useEffect } from 'react';
import { MasterData, rupeesToPaise, formatInr, post } from '../../api/client';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BatchEntryModalProps {
  open: boolean;
  onClose: () => void;
  master: MasterData;
  onSaved: () => void;
}

type Row = {
  payeeId: number | '';
  amount: string;
  categoryId: number | '';
  methodId: number | '';
  date: string;
  note: string;
};

export default function BatchEntryModal({
  open,
  onClose,
  master,
  onSaved
}: BatchEntryModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const getTodayDate = () => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  };

  const getCashMethodId = () => {
    return master.paymentMethods.find((m) => m.code === 'cash')?.id ?? '';
  };

  const createBlankRow = (): Row => ({
    payeeId: '',
    amount: '',
    categoryId: '',
    methodId: getCashMethodId(),
    date: getTodayDate(),
    note: ''
  });

  useEffect(() => {
    if (open) {
      setRows([createBlankRow(), createBlankRow(), createBlankRow()]);
      setError('');
    }
  }, [open, master]);

  if (!open) return null;

  const handleAddRow = () => {
    setRows([...rows, createBlankRow()]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = [...rows];
    updated.splice(index, 1);
    setRows(updated);
  };

  const handleRowChange = <K extends keyof Row>(index: number, field: K, value: Row[K]) => {
    const updated = [...rows];
    if (updated[index]) {
      updated[index][field] = value;
      setRows(updated);
    }
  };

  const handleSave = async () => {
    const activeRows = rows.filter((row) => row.payeeId || row.amount);
    const parsedRows = activeRows.map((row) => ({
      ...row,
      amountPaise: rupeesToPaise(row.amount)
    }));

    if (!activeRows.length) {
      setError('Add at least one transaction before saving.');
      return;
    }

    if (parsedRows.some((row) => !row.payeeId || !row.amountPaise || !row.date)) {
      setError('Every used row needs a payee, valid amount, and date.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await post('/transactions/batch', {
        rows: parsedRows.map((row) => ({
          payeeId: Number(row.payeeId),
          amountPaise: row.amountPaise,
          categoryId: row.categoryId ? Number(row.categoryId) : null,
          paymentMethodId: row.methodId ? Number(row.methodId) : null,
          transactionDate: row.date,
          note: row.note.trim() || null
        }))
      });

      toast.success(`${activeRows.length} payments recorded`, {
        description: 'The batch was saved atomically.'
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Batch could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />

      {/* Modal Dialog Content */}
      <div className="relative w-full max-w-[1000px] max-h-[85vh] bg-white rounded-xl shadow-2xl flex flex-col z-10 border border-ledger-border animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-ledger-border bg-white sticky top-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-ledger-muted tracking-wider">
              Several payments
            </span>
            <h2 className="text-xl font-bold text-ledger-ink leading-tight">
              Batch payment desk
            </h2>
            <p className="text-xs text-ledger-muted mt-0.5">
              Record up to 100 current or backdated payments in one audited batch.
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

        {/* Scrollable Rows Table container */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ledger-border text-ledger-muted font-semibold">
                <th className="py-2 pr-4 w-[20%]">Payee</th>
                <th className="py-2 px-4 w-[15%]">Amount</th>
                <th className="py-2 px-4 w-[18%]">Date</th>
                <th className="py-2 px-4 w-[18%]">Category</th>
                <th className="py-2 px-4 w-[15%]">Method</th>
                <th className="py-2 px-4 w-[20%]">Purpose</th>
                <th className="py-2 pl-4 w-[4%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-border/40">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-ledger-selection/20 transition-colors">
                  <td className="py-2 pr-4">
                    <select
                      value={row.payeeId}
                      onChange={(e) =>
                        handleRowChange(
                          index,
                          'payeeId',
                          e.target.value ? Number(e.target.value) : ''
                        )
                      }
                      className="form-input text-xs py-1"
                    >
                      <option value="">Choose payee...</option>
                      {master.payees.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => handleRowChange(index, 'amount', e.target.value)}
                      placeholder="e.g. 800"
                      className="form-input text-xs py-1 font-mono"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => handleRowChange(index, 'date', e.target.value)}
                      className="form-input text-xs py-1"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={row.categoryId}
                      onChange={(e) =>
                        handleRowChange(
                          index,
                          'categoryId',
                          e.target.value ? Number(e.target.value) : ''
                        )
                      }
                      className="form-input text-xs py-1"
                    >
                      <option value="">Review later</option>
                      {master.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={row.methodId}
                      onChange={(e) =>
                        handleRowChange(
                          index,
                          'methodId',
                          e.target.value ? Number(e.target.value) : ''
                        )
                      }
                      className="form-input text-xs py-1"
                    >
                      {master.paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={row.note}
                      onChange={(e) => handleRowChange(index, 'note', e.target.value)}
                      placeholder="Optional"
                      className="form-input text-xs py-1"
                    />
                  </td>
                  <td className="py-2 pl-4 text-center">
                    <button
                      onClick={() => handleRemoveRow(index)}
                      className="p-1 rounded text-ledger-muted hover:text-ledger-review hover:bg-ledger-review/5 transition-colors"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="p-6 border-t border-ledger-border bg-ledger-workspace/30 flex justify-between items-center sticky bottom-0">
          <button onClick={handleAddRow} className="btn btn-secondary text-xs flex gap-1.5 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary text-xs py-1.5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary text-xs py-1.5"
            >
              {saving ? 'Saving...' : 'Record batch'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
