<script lang="ts">
  import { onMount } from 'svelte';
  import {
    api,
    formatInr,
    formatTime12,
    patch,
    post,
    queryString,
    rupeesToPaise,
    type LedgerTransaction,
    type MasterData
  } from '$lib/api';
  import {
    createTable,
    getCoreRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
    type Updater
  } from '@tanstack/table-core';
  import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, X } from '@lucide/svelte';
  import { Dialog } from '@ark-ui/svelte/dialog';
  import { Portal } from '@ark-ui/svelte/portal';

  interface TransactionPage {
    items: LedgerTransaction[];
    total: number;
    page: number;
    pageSize: number;
  }
  let { initialReviewOnly = false }: { initialReviewOnly?: boolean } = $props();
  let today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let date = $state(today);
  let search = $state('');
  let reviewOnly = $state(false);
  let includeVoided = $state(false);
  let savedView = $state('today');
  let page = $state(1);
  let result = $state<TransactionPage>({ items: [], total: 0, page: 1, pageSize: 50 });
  let master = $state<MasterData>({ payees: [], categories: [], paymentMethods: [] });
  let selected = $state<LedgerTransaction | null>(null);
  let transactionDate = $state('');
  let transactionTime = $state('');
  let amount = $state('');
  let categoryId = $state('');
  let methodId = $state('');
  let note = $state('');
  let needsReview = $state(false);
  let audit = $state<
    Array<{ id: number; action: string; changedAt: string; changeSource: string }>
  >([]);
  let error = $state('');
  let message = $state('');
  let sorting = $state<SortingState>([{ id: 'transactionTime', desc: true }]);
  const columns: ColumnDef<LedgerTransaction>[] = [
    { accessorKey: 'transactionTime', header: 'Time' },
    { accessorKey: 'payeeName', header: 'Payee' },
    { accessorKey: 'categoryName', header: 'Category' },
    { accessorKey: 'paymentMethodName', header: 'Method' },
    { accessorKey: 'note', header: 'Note' },
    { accessorKey: 'source', header: 'Source' },
    { accessorKey: 'amountPaise', header: 'Amount' }
  ];
  function updateSorting(updater: Updater<SortingState>): void {
    sorting = typeof updater === 'function' ? updater(sorting) : updater;
  }
  const table = $derived(
    createTable({
      data: result.items,
      columns,
      state: {
        sorting,
        columnPinning: { left: [], right: [] }
      },
      onStateChange: () => undefined,
      onSortingChange: updateSorting,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      manualPagination: true,
      renderFallbackValue: '—'
    })
  );

  async function load(): Promise<void> {
    try {
      result = await api<TransactionPage>(
        `/transactions${queryString({ date, from: savedView === 'month' ? `${today.slice(0, 8)}01` : undefined, search, reviewOnly, includeVoided, page, pageSize: 50 })}`
      );
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Ledger could not be loaded';
    }
  }

  async function openTransaction(item: LedgerTransaction): Promise<void> {
    selected = item;
    transactionDate = item.transactionDate;
    transactionTime = item.transactionTime.slice(0, 5);
    amount = (item.amountPaise / 100).toFixed(item.amountPaise % 100 ? 2 : 0);
    categoryId = item.categoryId?.toString() ?? '';
    methodId = item.paymentMethodId?.toString() ?? '';
    note = item.note ?? '';
    needsReview = item.needsReview;
    audit = await api(`/transactions/${item.id}/audit`);
  }

  async function saveCorrection(): Promise<void> {
    if (!selected) return;
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise) {
      error = 'Enter a valid positive rupee amount with at most two decimals.';
      return;
    }
    try {
      await patch(`/transactions/${selected.id}`, {
        transactionDate,
        transactionTime: `${transactionTime}:00`,
        amountPaise,
        categoryId: categoryId ? Number(categoryId) : null,
        paymentMethodId: methodId ? Number(methodId) : null,
        note: note || null,
        needsReview,
        expectedUpdatedAt: selected.updatedAt
      });
      message = 'Correction saved with an audit snapshot.';
      selected = null;
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Correction could not be saved';
    }
  }

  async function voidSelected(): Promise<void> {
    if (!selected) return;
    const reason = window.prompt('Reason for voiding this payment:');
    if (!reason) return;
    try {
      await post(`/transactions/${selected.id}/void`, { reason });
      message = 'Payment voided; the original and reason remain in audit history.';
      selected = null;
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Payment could not be voided';
    }
  }

  function applyFilters(): void {
    page = 1;
    void load();
  }
  function applyView(view: 'today' | 'review' | 'voided' | 'month' | 'all'): void {
    savedView = view;
    reviewOnly = view === 'review';
    includeVoided = view === 'voided';
    date = view === 'today' || view === 'review' || view === 'voided' ? today : '';
    if (view === 'month') date = '';
    page = 1;
    void load();
  }

  onMount(async () => {
    reviewOnly = initialReviewOnly;
    savedView = initialReviewOnly ? 'review' : 'today';
    master = await api<MasterData>('/master-data');
    await load();
  });
</script>

<div class="page-stack">
  <header class="page-header">
    <div>
      <h1>{initialReviewOnly ? 'Needs review' : 'Transaction ledger'}</h1>
    </div>
    <a
      class="button secondary"
      href={`/api/export/transactions.csv${queryString({ from: date, to: date, includeVoided })}`}
      ><Download size={14} />Export CSV</a
    >
  </header>

  <section class="filter-bar ledger-filter-shell">
    <nav class="ledger-saved-views" aria-label="Ledger views">
      {#each [['today', 'Today'], ['review', 'Review'], ['voided', 'With voided'], ['month', 'This month'], ['all', 'All']] as view}
        <button
          class:active={savedView === view[0]}
          onclick={() => applyView(view[0] as 'today' | 'review' | 'voided' | 'month' | 'all')}
          >{view[1]}</button
        >
      {/each}
    </nav>
    <div class="ledger-filter-fields">
      <label>Date<input type="date" bind:value={date} onchange={applyFilters} /></label>
      <label class="search-field"
        >Search<span class="input-with-icon"
          ><Search size={14} /><input
            bind:value={search}
            onkeydown={(event) => event.key === 'Enter' && applyFilters()}
            placeholder="Payee or note"
          /></span
        ></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={reviewOnly} onchange={applyFilters} /> Needs review</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={includeVoided} onchange={applyFilters} /> Include voided</label
      >
      <button class="button primary" onclick={applyFilters}>Apply</button>
    </div>
  </section>

  {#if message || error}<div class:error={Boolean(error)} class="notice">
      {error || message}
    </div>{/if}

  <section class="panel ledger-panel">
    <div class="panel-heading">
      <div>
        <h2>{date === today ? 'Today' : date}</h2>
        <p>{result.total} matching payments</p>
      </div>
      <strong class="ledger-total"
        >{formatInr(
          result.items
            .filter((item) => item.status === 'posted')
            .reduce((sum, item) => sum + item.amountPaise, 0)
        )}</strong
      >
    </div>
    <div class="table-wrap">
      <table class="ledger-table">
        <thead
          >{#each table.getHeaderGroups() as headerGroup}<tr
              >{#each headerGroup.headers as header}<th
                  class:amount={header.column.id === 'amountPaise'}
                  ><button class="sort-header" onclick={header.column.getToggleSortingHandler()}
                    >{String(
                      header.column.columnDef.header
                    )}{#if header.column.getIsSorted() === 'asc'}<ArrowUp
                        size={12}
                      />{:else if header.column.getIsSorted() === 'desc'}<ArrowDown
                        size={12}
                      />{:else}<ArrowUpDown size={12} />{/if}</button
                  ></th
                >{/each}<th><span class="sr-only">Actions</span></th></tr
            >{/each}</thead
        ><tbody>
          {#each table.getRowModel().rows as row}
            {@const item = row.original}
            <tr
              class:muted={item.status === 'voided'}
              class:review-row={item.needsReview && item.status === 'posted'}
            >
              <td class="mono">{formatTime12(item.transactionTime)}</td><td
                ><strong>{item.payeeName}</strong>{#if item.status === 'voided'}<span
                    class="tag danger">voided</span
                  >{/if}</td
              ><td>{item.categoryName ?? '—'}</td><td>{item.paymentMethodName ?? '—'}</td><td
                class="note-cell">{item.note ?? '—'}</td
              ><td><span class="tag">{item.source}</span></td><td class="amount"
                >{formatInr(item.amountPaise)}</td
              ><td
                ><button class="text-button" onclick={() => void openTransaction(item)}
                  >Review</button
                ></td
              >
            </tr>
          {:else}<tr><td colspan="8" class="empty">No payments match these filters.</td></tr>{/each}
        </tbody>
      </table>
    </div>
    <footer class="pagination">
      <span>Page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
      <div>
        <button
          class="button secondary"
          disabled={page <= 1}
          onclick={() => {
            page -= 1;
            void load();
          }}>Previous</button
        ><button
          class="button secondary"
          disabled={page * result.pageSize >= result.total}
          onclick={() => {
            page += 1;
            void load();
          }}>Next</button
        >
      </div>
    </footer>
  </section>
</div>

{#if selected}
  <Dialog.Root open onOpenChange={(details) => !details.open && (selected = null)} lazyMount>
    <Portal>
      <Dialog.Backdrop class="drawer-backdrop" />
      <Dialog.Positioner class="drawer-positioner">
        <Dialog.Content class="drawer">
          <header>
            <div>
              <p class="eyebrow">Transaction #{selected.id}</p>
              <Dialog.Title>{selected.payeeName}</Dialog.Title>
              <Dialog.Description
                >{selected.transactionDate} at {formatTime12(
                  selected.transactionTime
                )}</Dialog.Description
              >
            </div>
            <Dialog.CloseTrigger class="icon-button" aria-label="Close"
              ><X size={18} /></Dialog.CloseTrigger
            >
          </header>
          <div class="drawer-body">
            <div class="field-row">
              <label>Date<input type="date" bind:value={transactionDate} /></label>
              <label>Time<input type="time" bind:value={transactionTime} /></label>
            </div>
            <label>Amount in rupees<input bind:value={amount} inputmode="decimal" /></label>
            <label
              >Category<select bind:value={categoryId}
                ><option value="">Not selected</option>{#each master.categories as item}<option
                    value={item.id}>{item.name}</option
                  >{/each}</select
              ></label
            >
            <label
              >Payment method<select bind:value={methodId}
                ><option value="">Not selected</option>{#each master.paymentMethods as item}<option
                    value={item.id}>{item.displayName}</option
                  >{/each}</select
              ></label
            >
            <label>Purpose or note<textarea bind:value={note} rows="3"></textarea></label>
            <label class="check"
              ><input type="checkbox" bind:checked={needsReview} /> Keep in review queue</label
            >
            <div class="form-actions">
              <button
                class="button primary"
                disabled={selected.status === 'voided'}
                onclick={() => void saveCorrection()}>Save correction</button
              ><button
                class="button danger-button"
                disabled={selected.status === 'voided'}
                onclick={() => void voidSelected()}>Delete / void payment</button
              >
            </div>
            <div class="audit-list">
              <h3>Audit history</h3>
              {#each audit as entry}<article>
                  <span class="audit-mark"></span>
                  <div>
                    <strong>{entry.action}</strong><small
                      >{new Date(entry.changedAt).toLocaleString('en-IN')} · {entry.changeSource}</small
                    >
                  </div>
                </article>{/each}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
{/if}
