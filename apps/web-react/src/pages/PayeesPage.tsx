import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  post,
  patch,
  formatInr,
  MasterData,
  Payee,
  Category,
  PaymentMethod
} from '../api/client';
import { Star, Plus, Edit, Building2, User, Search, Check, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { PayeeDrawer } from '../components/common/PayeeDrawer';
import { SegmentedTabs } from '../components/common/SegmentedTabs';

export default function PayeesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'payees' | 'categories' | 'methods'>('payees');
  const [search, setSearch] = useState('');
  const [selectedPayee, setSelectedPayee] = useState<Payee | null>(null);

  // Payee Edit Modal state
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<Payee | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [payeeType, setPayeeType] = useState<'person' | 'company'>('person');
  const [aliases, setAliases] = useState('');
  const [notes, setNotes] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [savingPayee, setSavingPayee] = useState(false);

  // Queries
  const { data: master, refetch: refetchMaster } = useQuery<MasterData>({
    queryKey: ['master-data-all'],
    queryFn: () => api<MasterData>('/master-data?includeInactive=true')
  });

  const payees = master?.payees || [];
  const categories = master?.categories || [];
  const methods = master?.paymentMethods || [];

  // Sort payees by Total Spent descending by default (Section 4.3 Redesign Spec)
  const sortedPayees = useMemo(() => {
    let list = [...payees];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.aliases?.some((a) => a.toLowerCase().includes(q)));
    }
    return list.sort((a, b) => b.totalPaidPaise - a.totalPaidPaise);
  }, [payees, search]);

  const toggleFavorite = async (e: React.MouseEvent, payee: Payee) => {
    e.stopPropagation();
    try {
      await patch(`/payees/${payee.id}`, { favourite: !payee.favourite });
      await refetchMaster();
      toast.success(`${payee.name} ${!payee.favourite ? 'added to' : 'removed from'} favourites`);
    } catch {
      toast.error('Failed to update favourite status');
    }
  };

  const handleSavePayee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payeeName.trim() || savingPayee) return;
    setSavingPayee(true);
    try {
      const payload = {
        name: payeeName.trim(),
        type: payeeType,
        aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean),
        notes: notes.trim() || null,
        favourite
      };

      if (editingPayee) {
        await patch(`/payees/${editingPayee.id}`, payload);
        toast.success(`Updated payee ${editingPayee.name}`);
      } else {
        await post('/payees', payload);
        toast.success(`Created payee ${payeeName}`);
      }

      await refetchMaster();
      setPayeeModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save payee');
    } finally {
      setSavingPayee(false);
    }
  };

  const openAddModal = () => {
    setEditingPayee(null);
    setPayeeName('');
    setPayeeType('person');
    setAliases('');
    setNotes('');
    setFavourite(false);
    setPayeeModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, p: Payee) => {
    e.stopPropagation();
    setEditingPayee(p);
    setPayeeName(p.name);
    setPayeeType(p.type);
    setAliases(p.aliases?.join(', ') || '');
    setNotes(p.notes || '');
    setFavourite(p.favourite);
    setPayeeModalOpen(true);
  };

  const tabs = [
    { id: 'payees', label: `Payees (${payees.length})` },
    { id: 'categories', label: `Categories (${categories.length})` },
    { id: 'methods', label: `Payment Methods (${methods.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Primary Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Payees</h1>
          <p className="mt-1 text-sm text-[#667085]">People and companies you pay.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAddModal}
            className="btn btn-primary h-10 px-4 gap-2 shadow-xs"
          >
            <Plus size={18} />
            <span>Add Payee</span>
          </button>
        </div>
      </div>

      {/* Segmented Control Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SegmentedTabs
          options={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />
      </div>

      {/* Search Input */}
      {activeTab === 'payees' && (
        <div className="ledger-card p-4 bg-white border border-[#DDE3EC] rounded-2xl shadow-xs">
          <div className="relative w-full max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]" />
            <input
              type="text"
              name="payee-search"
              aria-label="Search payees"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter payees by name or alias…"
              className="form-input pl-10"
            />
          </div>
        </div>
      )}

      {/* Main Content View */}
      {activeTab === 'payees' && (
        <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F6F8FC] border-b border-[#DDE3EC] text-xs uppercase font-bold text-[#667085]">
                <tr>
                  <th className="py-3.5 px-5 w-12 text-center">Fav</th>
                  <th className="py-3.5 px-5">Payee Name</th>
                  <th className="py-3.5 px-5">Type</th>
                  <th className="py-3.5 px-5 text-center">Payments</th>
                  <th className="py-3.5 px-5 text-right">Total Spent</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE3EC]">
                {sortedPayees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#667085]">
                      <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="font-semibold text-base">No payees found</p>
                      <p className="text-xs mt-1">Add a new payee to start tracking payments.</p>
                    </td>
                  </tr>
                ) : (
                  sortedPayees.map((payee) => (
                    <tr
                      key={payee.id}
                      onClick={() => setSelectedPayee(payee)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedPayee(payee);
                        }
                      }}
                      tabIndex={0}
                      className="clickable-table-row hover:bg-[#F6F8FC] transition-colors"
                    >
                      {/* Favourite Star Toggle */}
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={(e) => toggleFavorite(e, payee)}
                          aria-label={`${payee.favourite ? 'Remove' : 'Add'} ${payee.name} ${payee.favourite ? 'from' : 'to'} favourites`}
                          className="p-1 hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Star
                            size={18}
                            className={
                              payee.favourite
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-slate-300 hover:text-amber-400'
                            }
                          />
                        </button>
                      </td>

                      {/* Payee Name with Initial Avatar */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <PayeeAvatar name={payee.name} size={34} />
                          <div>
                            <span className="font-bold text-[#111827] block text-base">{payee.name}</span>
                            {payee.aliases && payee.aliases.length > 0 && (
                              <span className="text-xs text-[#667085] truncate max-w-[250px] block">
                                {payee.aliases.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Outlined Pill (Company = Blue outline, Person = Gray outline) */}
                      <td className="py-3.5 px-5">
                        {payee.type === 'company' ? (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full border border-[#165DFF]/40 text-[#165DFF] bg-[#E9F1FF]/50 inline-flex items-center gap-1">
                            <Building2 size={12} /> Company
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full border border-slate-300 text-slate-700 bg-slate-50 inline-flex items-center gap-1">
                            <User size={12} /> Person
                          </span>
                        )}
                      </td>

                      {/* Payment Count */}
                      <td className="py-3.5 px-5 text-center font-semibold text-[#111827]">
                        {payee.paymentCount}
                      </td>

                      {/* Total Spent Column (Right-aligned 600 weight Tabular Nums) */}
                      <td className="py-3.5 px-5 text-right font-bold tabular-nums text-[#111827] text-base">
                        {formatInr(payee.totalPaidPaise)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={(e) => openEditModal(e, payee)}
                          aria-label={`Edit ${payee.name}`}
                          className="p-1.5 text-[#667085] hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded-lg transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Categories View */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="ledger-card bg-white p-4 border border-[#DDE3EC] rounded-xl flex items-center justify-between shadow-xs">
              <div>
                <span className="font-bold text-[#111827] block">{cat.name}</span>
                <span className="text-xs text-[#667085]">Sort Order: {cat.sortOrder}</span>
              </div>
              <span className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md">
                Active
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Payment Methods View */}
      {activeTab === 'methods' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {methods.map((method) => (
            <div key={method.id} className="ledger-card bg-white p-4 border border-[#DDE3EC] rounded-xl flex items-center justify-between shadow-xs">
              <div>
                <span className="font-bold text-[#111827] block">{method.displayName}</span>
                <span className="font-mono text-xs text-[#667085]">{method.code}</span>
              </div>
              <span className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md">
                {method.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Payee Detail Drawer */}
      <PayeeDrawer
        payee={selectedPayee}
        onClose={() => setSelectedPayee(null)}
      />

      {/* Payee Add/Edit Modal */}
      {payeeModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-[#111827]">
              {editingPayee ? `Edit Payee: ${editingPayee.name}` : 'Create New Payee'}
            </h2>

            <form onSubmit={handleSavePayee} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Payee Name *
                </label>
                <input
                  type="text"
                  required
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar or ABC Tools"
                  className="form-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayeeType('person')}
                    className={`btn h-10 text-xs font-bold ${
                      payeeType === 'person'
                        ? 'btn-primary'
                        : 'btn-secondary'
                    }`}
                  >
                    Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayeeType('company')}
                    className={`btn h-10 text-xs font-bold ${
                      payeeType === 'company'
                        ? 'btn-primary'
                        : 'btn-secondary'
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Aliases (comma separated)
                </label>
                <input
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="e.g. Ramesh, Rameshji"
                  className="form-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes or contact details..."
                  className="form-input h-auto py-2"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="favCheck"
                  checked={favourite}
                  onChange={(e) => setFavourite(e.target.checked)}
                  className="w-4 h-4 rounded border-[#DDE3EC] text-[#165DFF]"
                />
                <label htmlFor="favCheck" className="text-sm font-medium text-[#111827]">
                  Mark as Favourite Payee
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DDE3EC]">
                <button
                  type="button"
                  onClick={() => setPayeeModalOpen(false)}
                  className="btn btn-secondary h-10 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayee}
                  className="btn btn-primary h-10 px-5"
                >
                  {savingPayee ? 'Saving...' : 'Save Payee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
