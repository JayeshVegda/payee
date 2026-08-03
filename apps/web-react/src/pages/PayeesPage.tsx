import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  post,
  patch,
  del,
  formatInr,
  MasterData,
  Payee,
  Category,
  PaymentMethod
} from '../api/client';
import { Star, Plus, Edit, Building2, User, Search, Check, Inbox, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { PayeeAvatar } from '../components/common/PayeeAvatar';
import { PayeeDrawer } from '../components/common/PayeeDrawer';
import { SegmentedTabs } from '../components/common/SegmentedTabs';
import { ConfirmModal } from '../components/common/ConfirmModal';

export default function PayeesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'payees' | 'categories' | 'methods'>('payees');
  const [search, setSearch] = useState('');
  const [selectedPayee, setSelectedPayee] = useState<Payee | null>(null);
  const [payeePage, setPayeePage] = useState(1);
  const [payeeSort, setPayeeSort] = useState<'spent' | 'name' | 'recent' | 'payments'>('spent');
  const payeePageSize = 12;

  // Payee Edit Modal state
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<Payee | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [payeeType, setPayeeType] = useState<'person' | 'company'>('person');
  const [aliases, setAliases] = useState('');
  const [notes, setNotes] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [savingPayee, setSavingPayee] = useState(false);

  // Category Edit Modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categorySortOrder, setCategorySortOrder] = useState(0);
  const [savingCategory, setSavingCategory] = useState(false);

  // Payment Method Edit Modal state
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [methodDisplayName, setMethodDisplayName] = useState('');
  const [methodCode, setMethodCode] = useState('');
  const [methodActive, setMethodActive] = useState(true);
  const [savingMethod, setSavingMethod] = useState(false);

  // Dynamic ConfirmModal State
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: 'danger' | 'warning' | 'info' | 'success';
    confirmText: string;
    previewData?: Record<string, React.ReactNode>;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    type: 'info',
    confirmText: '',
    onConfirm: () => {}
  });

  // Queries
  const { data: master, isError: masterError, refetch: refetchMaster } = useQuery<MasterData>({
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
    return list.sort((a, b) => {
      if (payeeSort === 'name') return a.name.localeCompare(b.name, 'en-IN');
      if (payeeSort === 'payments') return b.paymentCount - a.paymentCount;
      if (payeeSort === 'recent') return b.updatedAt.localeCompare(a.updatedAt);
      return b.totalPaidPaise - a.totalPaidPaise;
    });
  }, [payees, search, payeeSort]);

  const payeePageCount = Math.max(1, Math.ceil(sortedPayees.length / payeePageSize));
  const visiblePayees = useMemo(
    () => sortedPayees.slice((payeePage - 1) * payeePageSize, payeePage * payeePageSize),
    [sortedPayees, payeePage]
  );

  useEffect(() => setPayeePage(1), [search, payeeSort]);
  useEffect(() => {
    if (payeePage > payeePageCount) setPayeePage(payeePageCount);
  }, [payeePage, payeePageCount]);

  const filteredCategories = useMemo(() => {
    let list = [...categories];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, search]);

  const filteredMethods = useMemo(() => {
    let list = [...methods];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.displayName.toLowerCase().includes(q) || m.code.toLowerCase().includes(q));
    }
    return list;
  }, [methods, search]);

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

  const handleSavePayee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payeeName.trim() || savingPayee) return;
    const payload = {
      name: payeeName.trim(),
      type: payeeType,
      aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean),
      notes: notes.trim() || null,
      favourite
    };

    setConfirmModalConfig({
      isOpen: true,
      title: editingPayee ? 'Save Payee Changes?' : 'Create New Payee?',
      description: editingPayee ? 'Review details before saving changes.' : 'Confirm registering this new payee.',
      type: 'info',
      confirmText: editingPayee ? 'Save Payee' : 'Create Payee',
      previewData: {
        'Name': payload.name,
        'Aliases': payload.aliases.join(', ') || 'None',
        'Notes': payload.notes || 'None',
        'Favorite': payload.favourite ? 'Yes' : 'No'
      },
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        setSavingPayee(true);
        try {
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
      }
    });
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim() || savingCategory) return;
    const payload = {
      name: categoryName.trim(),
      sortOrder: Number(categorySortOrder)
    };

    setConfirmModalConfig({
      isOpen: true,
      title: editingCategory ? 'Save Category Changes?' : 'Create New Category?',
      description: editingCategory ? 'Review details before updating category.' : 'Confirm adding this new category.',
      type: 'info',
      confirmText: editingCategory ? 'Save Category' : 'Create Category',
      previewData: {
        'Category Name': payload.name,
        'Sort Order': payload.sortOrder.toString()
      },
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        setSavingCategory(true);
        try {
          if (editingCategory) {
            await patch(`/categories/${editingCategory.id}`, payload);
            toast.success(`Updated category ${categoryName}`);
          } else {
            await post('/categories', payload);
            toast.success(`Created category ${categoryName}`);
          }
          await refetchMaster();
          setCategoryModalOpen(false);
        } catch (err: any) {
          toast.error(err.message || 'Failed to save category');
        } finally {
          setSavingCategory(false);
        }
      }
    });
  };

  const handleDeleteCategory = (cat: Category) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Category?',
      description: `Deleting this category is permanent. Are you sure you want to delete category "${cat.name}"?`,
      type: 'danger',
      confirmText: 'Delete Category',
      previewData: {
        'Category Name': cat.name
      },
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          await del(`/categories/${cat.id}`);
          toast.success(`Deleted category "${cat.name}"`);
          await refetchMaster();
        } catch (err: any) {
          toast.error(err.message || 'Failed to delete category');
        }
      }
    });
  };

  const handleSaveMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!methodDisplayName.trim() || !methodCode.trim() || savingMethod) return;
    const payload = {
      displayName: methodDisplayName.trim(),
      code: methodCode.trim().toLowerCase(),
      active: methodActive
    };

    setConfirmModalConfig({
      isOpen: true,
      title: editingMethod ? 'Save Payment Method Changes?' : 'Create Payment Method?',
      description: editingMethod ? 'Review details before updating payment method.' : 'Confirm registering this payment method.',
      type: 'info',
      confirmText: editingMethod ? 'Save Method' : 'Create Method',
      previewData: {
        'Display Name': payload.displayName,
        'Method Code': payload.code,
        'Status': payload.active ? 'Active' : 'Inactive'
      },
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        setSavingMethod(true);
        try {
          if (editingMethod) {
            await patch(`/payment-methods/${editingMethod.id}`, {
              displayName: payload.displayName,
              active: payload.active
            });
            toast.success(`Updated payment method ${methodDisplayName}`);
          } else {
            await post('/payment-methods', payload);
            toast.success(`Created payment method ${methodDisplayName}`);
          }
          await refetchMaster();
          setMethodModalOpen(false);
        } catch (err: any) {
          toast.error(err.message || 'Failed to save payment method');
        } finally {
          setSavingMethod(false);
        }
      }
    });
  };

  const handleDeleteMethod = (method: PaymentMethod) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Payment Method?',
      description: `Deleting this payment method is permanent. Are you sure you want to delete "${method.displayName}"?`,
      type: 'danger',
      confirmText: 'Delete Method',
      previewData: {
        'Display Name': method.displayName,
        'Code': method.code
      },
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          await del(`/payment-methods/${method.id}`);
          toast.success(`Deleted payment method "${method.displayName}"`);
          await refetchMaster();
        } catch (err: any) {
          toast.error(err.message || 'Failed to delete payment method');
        }
      }
    });
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
    { id: 'payees', label: 'Payees' },
    { id: 'categories', label: 'Categories' },
    { id: 'methods', label: 'Payment Methods' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Master Registers</h1>
      {masterError && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          <span className="font-semibold">Connection Error:</span>
          <span>Unable to connect to the backend server. Please verify the server is running locally on port 4782.</span>
          <button onClick={() => refetchMaster().catch(() => null)} className="ml-auto underline font-semibold hover:text-red-900">Retry</button>
        </div>
      )}
      {/* Unified Register Control Bar */}
      <div className="ledger-card p-3 bg-white border border-[#DDE3EC] rounded-2xl shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left: Tab Switch (Segmented Control) */}
        <div className="shrink-0">
          <SegmentedTabs
            options={tabs}
            activeId={activeTab}
            onChange={(id) => {
              setActiveTab(id as any);
              setSearch(''); // Clear search on tab switch
            }}
          />
        </div>

        {/* Middle: Search Input */}
        <div className="relative flex-1 w-full max-w-md lg:mx-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]" />
          <input
            type="text"
            name="payee-search"
            aria-label="Search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'payees'
                ? "Search payees by name or alias…"
                : activeTab === 'categories'
                ? "Search categories…"
                : "Search payment methods…"
            }
            className="form-input form-input-with-icon h-10 text-xs"
          />
        </div>

        {/* Right: View Toggle (Grid / Table) & Add CTA Button */}
        <div className="flex items-center gap-3 shrink-0 w-full lg:w-auto justify-end">
          {activeTab === 'payees' && (
            <select
              value={payeeSort}
              onChange={(event) => setPayeeSort(event.target.value as typeof payeeSort)}
              className="form-input h-9 w-40 text-xs"
              aria-label="Sort payees"
            >
              <option value="spent">Highest spend</option>
              <option value="name">Name A–Z</option>
              <option value="recent">Recently paid</option>
              <option value="payments">Most payments</option>
            </select>
          )}

          {/* CTA Add Button */}
          {activeTab === 'payees' && (
            <button
              onClick={openAddModal}
              className="btn btn-primary h-9 px-4 gap-1.5 shadow-xs cursor-pointer text-xs text-white"
            >
              <Plus size={16} />
              <span>Add Payee</span>
            </button>
          )}
          {activeTab === 'categories' && (
            <button
              onClick={() => {
                setEditingCategory(null);
                setCategoryName('');
                setCategorySortOrder(0);
                setCategoryModalOpen(true);
              }}
              className="btn btn-primary h-9 px-4 gap-1.5 shadow-xs cursor-pointer text-xs text-white"
            >
              <Plus size={16} />
              <span>Add Category</span>
            </button>
          )}
          {activeTab === 'methods' && (
            <button
              onClick={() => {
                setEditingMethod(null);
                setMethodDisplayName('');
                setMethodCode('');
                setMethodActive(true);
                setMethodModalOpen(true);
              }}
              className="btn btn-primary h-9 px-4 gap-1.5 shadow-xs cursor-pointer text-xs text-white"
            >
              <Plus size={16} />
              <span>Add Method</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content View */}
      {activeTab === 'payees' && (
        <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F6F8FC] border-b border-[#DDE3EC] text-xs uppercase font-bold text-[#667085]">
                <tr>
                  <th className="py-3.5 px-5 w-12 text-center">Fav</th>
                  <th className="py-3.5 px-5">Payee Name</th>
                  <th className="py-3.5 px-5 text-center">Payments</th>
                  <th className="py-3.5 px-5 text-right">This Month</th>
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
                  visiblePayees.map((payee) => (
                    <tr
                      key={payee.id}
                      onClick={() => navigate(`/payees/${payee.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/payees/${payee.id}`);
                        }
                      }}
                      tabIndex={0}
                      className="clickable-table-row hover:bg-[#F6F8FC] transition-colors cursor-pointer"
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
                          </div>
                        </div>
                      </td>

                      {/* Payment Count */}
                      <td className="py-3.5 px-5 text-center font-semibold text-[#111827]">
                        {payee.paymentCount}
                      </td>

                      {/* This Month Spent Column */}
                      <td className="py-3.5 px-5 text-right font-bold tabular-nums text-slate-700 text-sm">
                        {formatInr(payee.thisMonthPaidPaise)}
                      </td>

                      {/* Total Spent Column (Right-aligned 600 weight Tabular Nums) */}
                      <td className="py-3.5 px-5 text-right font-bold tabular-nums text-[#111827] text-base">
                        {formatInr(payee.totalPaidPaise)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => openEditModal(e, payee)}
                          aria-label={`Edit ${payee.name}`}
                          className="p-1.5 text-[#667085] hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded-lg transition-colors cursor-pointer"
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
          {sortedPayees.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#DDE3EC] bg-[#FAFBFD] px-5 py-3 text-xs text-[#667085]">
              <span>
                {(payeePage - 1) * payeePageSize + 1}–{Math.min(payeePage * payeePageSize, sortedPayees.length)} of {sortedPayees.length} payees
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPayeePage((page) => Math.max(1, page - 1))} disabled={payeePage === 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:border-[#165DFF] hover:text-[#165DFF] disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={15} /></button>
                <span className="min-w-20 text-center font-semibold text-[#344054]">Page {payeePage} of {payeePageCount}</span>
                <button type="button" onClick={() => setPayeePage((page) => Math.min(payeePageCount, page + 1))} disabled={payeePage === payeePageCount} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:border-[#165DFF] hover:text-[#165DFF] disabled:opacity-40" aria-label="Next page"><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {false && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {sortedPayees.length === 0 ? (
            <div className="col-span-1 md:col-span-4 ledger-card bg-white py-8 text-center text-[#667085]">
              <Inbox size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-base">No payees found</p>
              <p className="text-xs mt-1">Add a new payee to start tracking payments.</p>
            </div>
          ) : (
            sortedPayees.map((payee) => (
              <div
                key={payee.id}
                onClick={() => navigate(`/payees/${payee.id}`)}
                className="ledger-card bg-white p-3 border border-[#DDE3EC] rounded-xl flex flex-col justify-between shadow-xs hover:border-[#165DFF]/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PayeeAvatar name={payee.name} size={30} />
                    <div className="min-w-0">
                      <span className="font-bold text-[#111827] block text-xs group-hover:text-[#165DFF] transition-colors truncate">
                        {payee.name}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(e, payee);
                    }}
                    className="p-1 text-slate-300 hover:text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <Star
                      size={15}
                      className={payee.favourite ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}
                    />
                  </button>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#F1F5F9] grid grid-cols-3 gap-1 text-[10px] text-[#667085]">
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-[#667085]">Count</span>
                    <strong className="text-xs font-bold text-[#111827] tabular-nums block mt-0.5">{payee.paymentCount}</strong>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-[#667085]">Month</span>
                    <strong className="text-xs font-bold text-[#111827] tabular-nums block mt-0.5">{formatInr(payee.thisMonthPaidPaise)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] uppercase font-bold text-[#667085]">Total</span>
                    <strong className="text-xs font-black text-[#111827] tabular-nums block mt-0.5">{formatInr(payee.totalPaidPaise)}</strong>
                  </div>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-slate-500 truncate max-w-[130px]">
                    {payee.notes || ''}
                  </span>
                  <button
                    onClick={(e) => openEditModal(e, payee)}
                    aria-label={`Edit ${payee.name}`}
                    className="p-1 text-[#667085] hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded transition-colors cursor-pointer"
                  >
                    <Edit size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Categories View */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredCategories.map((cat) => (
            <div key={cat.id} className="ledger-card bg-white p-4 border border-[#DDE3EC] rounded-xl flex items-center justify-between shadow-xs">
              <div>
                <span className="font-bold text-[#111827] block text-base">{cat.name}</span>
                <span className="text-xs text-[#667085]">Sort Order: {cat.sortOrder}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingCategory(cat);
                    setCategoryName(cat.name);
                    setCategorySortOrder(cat.sortOrder);
                    setCategoryModalOpen(true);
                  }}
                  className="p-1.5 text-[#667085] hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded-lg transition-colors cursor-pointer"
                  title="Edit category"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat)}
                  className="p-1.5 text-[#667085] hover:text-[#FF2638] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Methods View */}
      {activeTab === 'methods' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredMethods.map((method) => (
            <div key={method.id} className="ledger-card bg-white p-4 border border-[#DDE3EC] rounded-xl flex items-center justify-between shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#111827] text-base">{method.displayName}</span>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-md">
                    {method.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#667085]">{method.code}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingMethod(method);
                    setMethodDisplayName(method.displayName);
                    setMethodCode(method.code);
                    setMethodActive(method.active);
                    setMethodModalOpen(true);
                  }}
                  className="p-1.5 text-[#667085] hover:text-[#165DFF] hover:bg-[#E9F1FF] rounded-lg transition-colors cursor-pointer"
                  title="Edit payment method"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDeleteMethod(method)}
                  className="p-1.5 text-[#667085] hover:text-[#FF2638] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete payment method"
                >
                  <Trash2 size={14} />
                </button>
              </div>
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

      {/* Category Add/Edit Modal */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-[#111827]">
              {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Create New Category'}
            </h2>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Subcontractors, Utilities"
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={categorySortOrder}
                  onChange={(e) => setCategorySortOrder(Number(e.target.value))}
                  placeholder="0"
                  className="form-input"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DDE3EC]">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="btn btn-secondary h-10 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="btn btn-primary h-10 px-5 text-white"
                >
                  {savingCategory ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Method Add/Edit Modal */}
      {methodModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-[#111827]">
              {editingMethod ? `Edit Method: ${editingMethod.displayName}` : 'Create New Payment Method'}
            </h2>
            <form onSubmit={handleSaveMethod} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={methodDisplayName}
                  onChange={(e) => setMethodDisplayName(e.target.value)}
                  placeholder="e.g. Google Pay, HDFC Credit Card"
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingMethod}
                  value={methodCode}
                  onChange={(e) => setMethodCode(e.target.value)}
                  placeholder="e.g. gpay, card"
                  className="form-input font-mono disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="methodActiveCheck"
                  checked={methodActive}
                  onChange={(e) => setMethodActive(e.target.checked)}
                  className="w-4 h-4 rounded border-[#DDE3EC] text-[#165DFF]"
                />
                <label htmlFor="methodActiveCheck" className="text-sm font-medium text-[#111827]">
                  Active (available in quick entry)
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DDE3EC]">
                <button
                  type="button"
                  onClick={() => setMethodModalOpen(false)}
                  className="btn btn-secondary h-10 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMethod}
                  className="btn btn-primary h-10 px-5 text-white"
                >
                  {savingMethod ? 'Saving...' : 'Save Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Dynamic ConfirmModal */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        type={confirmModalConfig.type}
        confirmText={confirmModalConfig.confirmText}
        previewData={confirmModalConfig.previewData}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
