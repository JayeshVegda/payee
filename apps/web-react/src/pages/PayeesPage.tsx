import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  post,
  patch,
  formatInr,
  MasterData,
  Payee
} from '../api/client';
import { Star, Plus, Edit, Building2, User, Search, Inbox, X } from 'lucide-react';
import { toast } from 'sonner';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { PayeeDrawer } from '../components/common/PayeeDrawer';
import { SegmentedTabs } from '../components/common/SegmentedTabs';

export default function PayeesPage() {
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
    <div className="space-y-8">
      {/* Title & Primary Action */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/40 pb-6">
        <div>
          <h1 className="sr-only">Master Registers</h1>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-sans">
            Payees
          </h2>
          <p className="text-xs text-stone-500 mt-1 font-medium">People and companies you distribute payments to.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg shadow-sm hover:shadow transition-all duration-150 cursor-pointer border-none"
          >
            <Plus size={16} />
            <span>Add Payee</span>
          </button>
        </div>
      </header>

      {/* Segmented Control Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap select-none">
        <SegmentedTabs
          options={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />
      </div>

      {/* Search Input */}
      {activeTab === 'payees' && (
        <div className="bg-white p-4 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50">
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              name="payee-search"
              aria-label="Search payees"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter payees by name or alias…"
              className="w-full h-10 pl-10 pr-4 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-stone-400 placeholder:font-normal"
            />
          </div>
        </div>
      )}

      {/* Main Content View */}
      {activeTab === 'payees' && (
        <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] border border-[#E5E7EB]/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50/70 border-b border-[#E5E7EB]/80 text-[10px] uppercase font-bold tracking-wider text-stone-400 h-11 select-none">
                <tr>
                  <th className="py-3.5 px-5 w-12 text-center">Fav</th>
                  <th className="py-3.5 px-5">Payee Name</th>
                  <th className="py-3.5 px-5">Type</th>
                  <th className="py-3.5 px-5 text-center">Payments</th>
                  <th className="py-3.5 px-5 text-right">Total Spent</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100/50">
                {sortedPayees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-stone-400">
                      <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="font-semibold text-sm text-stone-850">No payees found</p>
                      <p className="text-xs text-stone-500 mt-1">Add a new payee to start tracking payments.</p>
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
                      className="clickable-table-row hover:bg-stone-50/40 transition-colors duration-150 h-14 outline-none"
                    >
                      {/* Favourite Star Toggle */}
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={(e) => toggleFavorite(e, payee)}
                          aria-label={`${payee.favourite ? 'Remove' : 'Add'} ${payee.name} ${payee.favourite ? 'from' : 'to'} favourites`}
                          className="p-1 hover:scale-110 transition-transform cursor-pointer border-none bg-transparent"
                        >
                          <Star
                            size={16}
                            className={
                              payee.favourite
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-stone-300 hover:text-amber-400'
                            }
                          />
                        </button>
                      </td>

                      {/* Payee Name with Initial Avatar */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <PayeeAvatar name={payee.name} size={30} />
                          <div>
                            <span className="font-bold text-stone-900 block text-sm">{payee.name}</span>
                            {payee.aliases && payee.aliases.length > 0 && (
                              <span className="text-[10px] font-semibold text-stone-400 truncate max-w-[250px] block mt-0.5">
                                {payee.aliases.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Outlined Pill */}
                      <td className="py-3.5 px-5 select-none">
                        {payee.type === 'company' ? (
                          <span className="px-2.5 py-0.5 text-[9px] font-bold uppercase rounded border border-blue-200 text-blue-800 bg-blue-50/50 inline-flex items-center gap-1">
                            <Building2 size={10} /> Company
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 text-[9px] font-bold uppercase rounded border border-stone-200 text-stone-700 bg-stone-50 inline-flex items-center gap-1">
                            <User size={10} /> Person
                          </span>
                        )}
                      </td>

                      {/* Payment Count */}
                      <td className="py-3.5 px-5 text-center font-bold text-stone-900">
                        {payee.paymentCount}
                      </td>

                      {/* Total Spent Column */}
                      <td className="py-3.5 px-5 text-right font-black tabular-nums text-stone-950 text-base">
                        {formatInr(payee.totalPaidPaise)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={(e) => openEditModal(e, payee)}
                          aria-label={`Edit ${payee.name}`}
                          className="p-1.5 text-stone-400 hover:text-[#2563EB] hover:bg-blue-50/80 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
                        >
                          <Edit size={14} />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white p-5 rounded-xl border border-stone-100/60 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] flex items-center justify-between">
              <div>
                <span className="font-bold text-stone-900 block text-sm">{cat.name}</span>
                <span className="text-[10px] text-stone-400 mt-1 block font-semibold uppercase">Sort Order: {cat.sortOrder}</span>
              </div>
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase border border-emerald-250 text-emerald-800 bg-emerald-50 rounded-full">
                Active
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Payment Methods View */}
      {activeTab === 'methods' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {methods.map((method) => (
            <div key={method.id} className="bg-white p-5 rounded-xl border border-stone-100/60 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.03)] flex items-center justify-between">
              <div>
                <span className="font-bold text-stone-900 block text-sm">{method.displayName}</span>
                <span className="font-mono text-[10px] text-stone-400 mt-1 block font-semibold uppercase">{method.code}</span>
              </div>
              <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                method.active 
                  ? 'border-emerald-250 text-emerald-800 bg-emerald-50' 
                  : 'border-stone-250 text-stone-500 bg-stone-50'
              }`}>
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-stone-100 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900 font-sans">
                {editingPayee ? `Edit Payee: ${editingPayee.name}` : 'Create New Payee'}
              </h3>
              <button
                onClick={() => setPayeeModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 cursor-pointer border-none bg-transparent"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayee} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                  Payee Name *
                </label>
                <input
                  type="text"
                  required
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar or ABC Tools"
                  className="w-full h-10 px-3.5 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-stone-400 placeholder:font-normal"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setPayeeType('person')}
                    className={`h-9 text-xs font-bold rounded-lg cursor-pointer border transition-all ${
                      payeeType === 'person'
                        ? 'bg-[#2563EB] text-white border-transparent'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayeeType('company')}
                    className={`h-9 text-xs font-bold rounded-lg cursor-pointer border transition-all ${
                      payeeType === 'company'
                        ? 'bg-[#2563EB] text-white border-transparent'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                  Aliases (comma separated)
                </label>
                <input
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="e.g. Ramesh, Rameshji"
                  className="w-full h-10 px-3.5 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-stone-400 placeholder:font-normal"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes or contact details..."
                  className="w-full px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-stone-400 placeholder:font-normal h-auto"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1.5 select-none">
                <input
                  type="checkbox"
                  id="favCheck"
                  checked={favourite}
                  onChange={(e) => setFavourite(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="favCheck" className="text-xs font-semibold text-stone-600 cursor-pointer">
                  Mark as Favourite Payee
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setPayeeModalOpen(false)}
                  className="px-4 py-2 border border-stone-200 hover:bg-stone-50 text-stone-600 text-xs font-bold rounded-lg cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayee}
                  className="px-4.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer border-none disabled:opacity-50"
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
