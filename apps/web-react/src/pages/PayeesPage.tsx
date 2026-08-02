import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  post,
  patch,
  formatInr,
  formatTime12,
  MasterData,
  Payee,
  Category,
  LedgerTransaction
} from '../api/client';
import { X, Star, RefreshCw, Plus, Edit, Check, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function PayeesPage() {
  const { payeeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<'payees' | 'categories' | 'methods'>('payees');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Payee Edit Drawer state
  const [payeeDrawerOpen, setPayeeDrawerOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<Payee | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [payeeType, setPayeeType] = useState<'person' | 'company'>('person');
  const [aliases, setAliases] = useState('');
  const [defaultCatId, setDefaultCatId] = useState('');
  const [defaultMethodId, setDefaultMethodId] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingPayee, setSavingPayee] = useState(false);

  // Category Edit state (inline sidebar)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryAliases, setCategoryAliases] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [savingCategory, setSavingCategory] = useState(false);

  // Active Payee Profile Drawer state
  const [profilePayee, setProfilePayee] = useState<Payee | null>(null);
  const [recentPayments, setRecentPayments] = useState<LedgerTransaction[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Queries
  const { data: master, refetch: refetchMaster, isLoading } = useQuery<MasterData>({
    queryKey: ['master-data-all'],
    queryFn: () => api<MasterData>('/master-data?includeInactive=true')
  });

  const payees = master?.payees || [];
  const categories = master?.categories || [];
  const methods = master?.paymentMethods || [];

  // Load profile when payeeId parameter changes
  useEffect(() => {
    if (payeeId && payees.length > 0) {
      const found = payees.find((p) => p.id === Number(payeeId));
      if (found) {
        setProfilePayee(found);
        loadRecentPayments(found.id);
      } else {
        toast.error('Payee not found');
        navigate(`/payees${location.search}`);
      }
    } else {
      setProfilePayee(null);
      setRecentPayments([]);
    }
  }, [payeeId, payees]);

  const loadRecentPayments = async (pId: number) => {
    setLoadingPayments(true);
    try {
      const res = await api<{ items: LedgerTransaction[] }>(
        `/transactions?payeeId=${pId}&pageSize=20&includeVoided=true`
      );
      setRecentPayments(res.items);
    } catch {
      setRecentPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleCloseProfile = () => {
    navigate(`/payees${location.search}`);
  };

  // Payee CRUD Actions
  const handleOpenAddPayee = () => {
    setEditingPayee(null);
    setPayeeName('');
    setPayeeType('person');
    setAliases('');
    setDefaultCatId('');
    setDefaultMethodId('');
    setFavourite(false);
    setNotes('');
    setPayeeDrawerOpen(true);
  };

  const handleOpenEditPayee = (p: Payee) => {
    setEditingPayee(p);
    setPayeeName(p.name);
    setPayeeType(p.type);
    setAliases(p.aliases.join(', '));
    setDefaultCatId(p.defaultCategoryId?.toString() || '');
    setDefaultMethodId(p.defaultPaymentMethodId?.toString() || '');
    setFavourite(p.favourite);
    setNotes(p.notes || '');
    setPayeeDrawerOpen(true);
    // If profile drawer is open, close it to edit
    handleCloseProfile();
  };

  const handleSavePayee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payeeName.trim()) return;

    setSavingPayee(true);
    setError('');
    setMessage('');

    const payload = {
      name: payeeName.trim(),
      type: payeeType,
      aliases: aliases
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean),
      defaultCategoryId: defaultCatId ? Number(defaultCatId) : null,
      defaultPaymentMethodId: defaultMethodId ? Number(defaultMethodId) : null,
      favourite,
      notes: notes.trim() || null
    };

    try {
      if (editingPayee) {
        await patch(`/payees/${editingPayee.id}`, payload);
        toast.success('Payee updated successfully');
      } else {
        await post('/payees', payload);
        toast.success('Payee added successfully');
      }
      setPayeeDrawerOpen(false);
      refetchMaster();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payee could not be saved');
    } finally {
      setSavingPayee(false);
    }
  };

  const handleTogglePayeeActive = async (p: Payee) => {
    try {
      await patch(`/payees/${p.id}`, { active: !p.active });
      toast.success(`${p.name} status updated`);
      refetchMaster();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Status update failed');
    }
  };

  const handleTogglePayeeFavourite = async (p: Payee, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await patch(`/payees/${p.id}`, { favourite: !p.favourite });
      refetchMaster();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Favorite update failed');
    }
  };

  // Category Actions
  const handleEditCategory = (c: Category) => {
    setEditingCategory(c);
    setCategoryName(c.name);
    setCategoryAliases(
      c.aliases.filter((alias) => alias.toLowerCase() !== c.name.toLowerCase()).join(', ')
    );
    setSortOrder(c.sortOrder.toString());
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    setSavingCategory(true);
    setError('');
    try {
      const payload = {
        name: categoryName.trim(),
        aliases: categoryAliases
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        sortOrder: Number(sortOrder) || 0
      };

      if (editingCategory) {
        await patch(`/categories/${editingCategory.id}`, payload);
        toast.success('Category updated successfully');
      } else {
        await post('/categories', payload);
        toast.success('Category added successfully');
      }
      setEditingCategory(null);
      setCategoryName('');
      setCategoryAliases('');
      setSortOrder('0');
      refetchMaster();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Category could not be saved');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleToggleCategoryActive = async (c: Category) => {
    try {
      await patch(`/categories/${c.id}`, { active: !c.active });
      toast.success(`${c.name} status updated`);
      refetchMaster();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Status update failed');
    }
  };

  const handleToggleMethodActive = async (id: number, active: boolean) => {
    try {
      await patch(`/payment-methods/${id}`, { active: !active });
      toast.success('Payment method updated');
      refetchMaster();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Method update failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ledger-ink">
            Master Registers
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetchMaster()}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 bg-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {activeTab === 'payees' && (
            <button
              onClick={handleOpenAddPayee}
              className="btn btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Payee
            </button>
          )}
        </div>
      </header>

      {/* Tabs bar */}
      <nav className="flex bg-ledger-workspace p-0.5 rounded-lg border border-ledger-border w-max select-none" aria-label="Registers Tabs">
        {(
          [
            ['payees', 'Payees Directory'],
            ['categories', 'Categories'],
            ['methods', 'Payment Methods']
          ] as const
        ).map(([tCode, tName]) => {
          const countsMap = {
            payees: payees.length,
            categories: categories.length,
            methods: methods.length
          };
          return (
            <button
              key={tCode}
              onClick={() => {
                setActiveTab(tCode);
                setError('');
                setMessage('');
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
                activeTab === tCode
                  ? 'bg-white text-ledger-blue shadow-xs'
                  : 'text-ledger-muted hover:text-ledger-ink'
              }`}
            >
              {tName}
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-extrabold ${
                activeTab === tCode ? 'bg-ledger-blue/10 text-ledger-blue' : 'bg-ledger-border text-ledger-muted'
              }`}>
                {countsMap[tCode]}
              </span>
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="p-3 text-xs bg-ledger-review/10 border border-ledger-review/20 text-ledger-review rounded-md">
          {error}
        </div>
      )}

      {/* TABS CONTENT */}
      {activeTab === 'payees' && (
        <section className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-ledger-border/80 bg-ledger-workspace/30 text-ledger-muted font-semibold">
                  <th className="py-2.5 px-4 font-semibold w-[5%] text-center">Fav</th>
                  <th className="py-2.5 px-4 font-semibold w-[25%]">Payee Name</th>
                  <th className="py-2.5 px-4 font-semibold w-[10%]">Type</th>
                  <th className="py-2.5 px-4 font-semibold w-[25%]">Aliases</th>
                  <th className="py-2.5 px-4 font-semibold w-[12%] text-right">Payments</th>
                  <th className="py-2.5 px-4 font-semibold w-[15%] text-right">Total Spent</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-border/40">
                {payees.map((payee) => (
                  <tr
                    key={payee.id}
                    onClick={() => navigate(`/payees/${payee.id}${location.search}`)}
                    className={`hover:bg-ledger-selection/30 cursor-pointer transition-colors ${
                      !payee.active ? 'opacity-55' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => void handleTogglePayeeFavourite(payee, e)}
                        className={`p-1 rounded hover:bg-ledger-workspace transition-colors ${
                          payee.favourite ? 'text-amber-500' : 'text-ledger-muted/40 hover:text-ledger-muted'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${payee.favourite ? 'fill-current' : ''}`} />
                      </button>
                    </td>
                    <td className="py-3 px-4 font-semibold text-ledger-ink">
                      {payee.name}
                    </td>
                    <td className="py-3 px-4 capitalize text-ledger-muted font-medium">
                      {payee.type}
                    </td>
                    <td className="py-3 px-4 text-ledger-muted font-medium max-w-[200px] truncate">
                      {payee.aliases.join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-ledger-muted tabular-nums">
                      {payee.paymentCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-ledger-ink tabular-nums">
                      {formatInr(payee.totalPaidPaise)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenEditPayee(payee)}
                        className="px-2 py-0.5 text-[11px] font-semibold border border-ledger-border hover:border-ledger-blue hover:text-ledger-blue rounded bg-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleTogglePayeeActive(payee)}
                        className={`px-2 py-0.5 text-[11px] font-semibold border rounded transition-colors ${
                          payee.active
                            ? 'border-ledger-border hover:bg-red-50 hover:border-red-200 hover:text-ledger-review'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {payee.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {payees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 px-6 text-center text-ledger-muted italic">
                      Add the first worker, supplier or company registry item.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'categories' && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left panel inline add/edit form */}
          <form
            onSubmit={handleSaveCategory}
            className="ledger-card border-ledger-border bg-white flex flex-col gap-4 self-start p-5"
          >
            <div>
              <h2 className="text-sm font-bold text-ledger-ink uppercase tracking-wider">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h2>
              <p className="text-xs text-ledger-muted mt-0.5">
                Purpose groups and capture grammar keywords
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ledger-muted block">Category Name</label>
              <input
                type="text"
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Site materials"
                className="form-input text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ledger-muted block">Keywords (aliases)</label>
              <input
                type="text"
                value={categoryAliases}
                onChange={(e) => setCategoryAliases(e.target.value)}
                placeholder="cement, steel, sand"
                className="form-input text-xs"
              />
              <small className="text-[10px] text-ledger-muted block leading-normal mt-1">
                Comma-separated quick-entry matching keywords
              </small>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ledger-muted block">Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="form-input text-xs font-mono"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={savingCategory}
                className="btn btn-primary text-xs flex-1 py-2"
              >
                {editingCategory ? 'Save changes' : 'Add category'}
              </button>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName('');
                    setCategoryAliases('');
                    setSortOrder('0');
                  }}
                  className="btn btn-secondary text-xs flex-1 py-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Right directory list */}
          <div className="ledger-card p-0 overflow-hidden border-ledger-border shadow-sm bg-white md:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-ledger-border/80 bg-ledger-workspace/30 text-ledger-muted font-semibold">
                    <th className="py-2.5 px-4 font-semibold w-[12%] text-center">Order</th>
                    <th className="py-2.5 px-4 font-semibold w-[40%]">Category</th>
                    <th className="py-2.5 px-4 font-semibold w-[33%]">Keywords</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-border/40">
                  {categories.map((cat) => (
                    <tr
                      key={cat.id}
                      className={`hover:bg-ledger-selection/10 transition-colors ${
                        !cat.active ? 'opacity-55' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono font-bold text-ledger-muted tabular-nums">
                        {cat.sortOrder}
                      </td>
                      <td className="py-3 px-4 font-semibold text-ledger-ink">
                        {cat.name}
                      </td>
                      <td className="py-3 px-4 text-ledger-muted font-medium truncate max-w-[200px]">
                        {cat.aliases.join(' · ') || '—'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleEditCategory(cat)}
                          className="px-2 py-0.5 text-[11px] font-semibold border border-ledger-border hover:border-ledger-blue hover:text-ledger-blue rounded bg-white transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleToggleCategoryActive(cat)}
                          className={`px-2 py-0.5 text-[11px] font-semibold border rounded transition-colors ${
                            cat.active
                              ? 'border-ledger-border hover:bg-red-50 hover:border-red-200 hover:text-ledger-review'
                              : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {cat.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'methods' && (
        <section className="ledger-card p-5 border-ledger-border bg-white space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ledger-ink uppercase tracking-wider">
              Payment methods
            </h2>
            <p className="text-xs text-ledger-muted mt-0.5">
              Stable system accounting codes used by capture parsing and analytics
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {methods.map((method) => (
              <article
                key={method.id}
                className={`p-4 border rounded-xl flex items-center justify-between gap-4 transition-all ${
                  method.active
                    ? 'border-ledger-border bg-white shadow-xs'
                    : 'border-ledger-border bg-ledger-workspace/55 opacity-60'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-ledger-workspace border border-ledger-border px-1.5 py-0.5 rounded text-ledger-muted">
                    {method.code}
                  </span>
                  <strong className="block text-sm font-bold text-ledger-ink mt-1.5 leading-tight">
                    {method.displayName}
                  </strong>
                  <small className="block text-[10px] text-ledger-muted mt-0.5">
                    Parser code: {method.code}
                  </small>
                </div>
                <button
                  onClick={() => void handleToggleMethodActive(method.id, method.active)}
                  className={`px-2.5 py-1 text-xs font-semibold border rounded transition-all ${
                    method.active
                      ? 'border-ledger-border hover:bg-red-50 hover:border-red-200 hover:text-ledger-review'
                      : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {method.active ? 'Deactivate' : 'Activate'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Payee Edit Drawer */}
      {payeeDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40" onClick={() => setPayeeDrawerOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col z-10 border-l border-ledger-border animate-in slide-in-from-right duration-200">
            <header className="flex items-center justify-between px-6 py-4 border-b border-ledger-border">
              <div>
                <h2 className="text-lg font-bold text-ledger-ink">
                  {editingPayee ? 'Edit payee' : 'Add payee'}
                </h2>
                <p className="text-xs text-ledger-muted mt-0.5">
                  Record payee contact profiles
                </p>
              </div>
              <button
                onClick={() => setPayeeDrawerOpen(false)}
                className="p-1.5 rounded-md hover:bg-ledger-selection text-ledger-muted hover:text-ledger-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <form onSubmit={handleSavePayee} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold text-ledger-muted">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ledger-muted block">Name</label>
                <input
                  type="text"
                  required
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. ABC Tools or Ramesh Kumar"
                  className="form-input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ledger-muted block">Type</label>
                  <select
                    value={payeeType}
                    onChange={(e) => setPayeeType(e.target.value as 'person' | 'company')}
                    className="form-input text-xs"
                  >
                    <option value="person">Person</option>
                    <option value="company">Company</option>
                  </select>
                </div>

                <div className="pt-6">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-ledger-ink select-none">
                    <input
                      type="checkbox"
                      checked={favourite}
                      onChange={(e) => setFavourite(e.target.checked)}
                      className="rounded border-ledger-border text-ledger-blue focus:ring-ledger-blue"
                    />
                    <span>Favourite shortcut</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ledger-muted block">Aliases</label>
                <input
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="ramesh, ramesh kumar"
                  className="form-input text-xs"
                />
                <small className="text-[10px] text-ledger-muted block leading-normal mt-1 font-medium">
                  Comma-separated shorthand matching names in smart command entry
                </small>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ledger-muted block">Default Category</label>
                <select
                  value={defaultCatId}
                  onChange={(e) => setDefaultCatId(e.target.value)}
                  className="form-input text-xs"
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ledger-muted block">Default Method</label>
                <select
                  value={defaultMethodId}
                  onChange={(e) => setDefaultMethodId(e.target.value)}
                  className="form-input text-xs"
                >
                  <option value="">Select method...</option>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ledger-muted block">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this contact..."
                  className="form-input text-xs resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-ledger-border/40">
                <button
                  type="submit"
                  disabled={savingPayee}
                  className="btn btn-primary text-xs flex-1 py-2"
                >
                  {savingPayee ? 'Saving...' : 'Save contact'}
                </button>
                <button
                  type="button"
                  onClick={() => setPayeeDrawerOpen(false)}
                  className="btn btn-secondary text-xs flex-1 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payee Profile Drawer */}
      {profilePayee && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40" onClick={handleCloseProfile} />

          {/* Drawer content Panel */}
          <div className="relative w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col z-10 border-l border-ledger-border animate-in slide-in-from-right duration-200">
            <header className="flex items-center justify-between px-6 py-4 border-b border-ledger-border">
              <div>
                <span className="text-[10px] uppercase font-bold text-ledger-muted tracking-wider">
                  Payee profile
                </span>
                <h2 className="text-lg font-bold text-ledger-ink leading-tight">
                  {profilePayee.name}
                </h2>
                <p className="text-xs text-ledger-muted mt-0.5 capitalize">
                  {profilePayee.type} · {profilePayee.active ? 'Active contact' : 'Inactive contact'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleOpenEditPayee(profilePayee)}
                  className="p-1.5 rounded-md hover:bg-ledger-selection text-ledger-muted hover:text-ledger-blue transition-colors"
                  title="Edit payee"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCloseProfile}
                  className="p-1.5 rounded-md hover:bg-ledger-selection text-ledger-muted hover:text-ledger-ink transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Financial Stats summary */}
              <section className="grid grid-cols-3 gap-3 text-center border-b border-ledger-border/40 pb-5">
                <div className="p-2.5 bg-ledger-workspace/30 border border-ledger-border/50 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-ledger-muted block">Total Paid</span>
                  <strong className="text-sm font-mono text-ledger-ink block tracking-tight mt-1 tabular-nums">
                    {formatInr(profilePayee.totalPaidPaise)}
                  </strong>
                </div>
                <div className="p-2.5 bg-ledger-workspace/30 border border-ledger-border/50 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-ledger-muted block">Payments</span>
                  <strong className="text-sm font-mono text-ledger-ink block tracking-tight mt-1 tabular-nums">
                    {profilePayee.paymentCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-ledger-workspace/30 border border-ledger-border/50 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-ledger-muted block">Average</span>
                  <strong className="text-sm font-mono text-ledger-ink block tracking-tight mt-1 tabular-nums">
                    {formatInr(
                      profilePayee.paymentCount
                        ? Math.round(profilePayee.totalPaidPaise / profilePayee.paymentCount)
                        : 0
                    )}
                  </strong>
                </div>
              </section>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                  General Info
                </h3>
                <dl className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                  <div>
                    <dt className="text-ledger-muted font-medium mb-0.5">Aliases</dt>
                    <dd className="text-ledger-ink font-semibold">{profilePayee.aliases.join(', ') || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-ledger-muted font-medium mb-0.5">Favourite</dt>
                    <dd className="text-ledger-ink font-semibold">{profilePayee.favourite ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                  Notes
                </h3>
                <p className="text-xs text-ledger-muted bg-ledger-workspace/30 p-3 rounded-lg border border-ledger-border/40 italic">
                  {profilePayee.notes || 'No description notes.'}
                </p>
              </div>

              {/* Recent payment transactions to this payee */}
              <section className="space-y-3">
                <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider border-b border-ledger-border/60 pb-1.5">
                  Recent Payments (Max 20)
                </h3>
                <div className="space-y-3">
                  {loadingPayments ? (
                    <p className="text-xs text-ledger-muted italic">Loading payments...</p>
                  ) : recentPayments.map((item) => (
                    <article
                      key={item.id}
                      className="p-3 border border-ledger-border/50 hover:border-ledger-blue bg-white rounded-lg flex items-center justify-between gap-4 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <strong className="text-xs text-ledger-ink block font-semibold">
                          {item.transactionDate} · {formatTime12(item.transactionTime)}
                        </strong>
                        <small className="text-[10px] text-ledger-muted block truncate max-w-[200px]">
                          {item.categoryName || 'Needs review'} · {item.note || 'No purpose'}
                        </small>
                      </div>
                      <b className="font-mono text-xs font-bold text-ledger-ink shrink-0 tabular-nums">
                        {formatInr(item.amountPaise)}
                      </b>
                    </article>
                  ))}
                  {recentPayments.length === 0 && !loadingPayments && (
                    <p className="text-xs text-ledger-muted italic">No payments yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
