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
    type MasterData,
    type QuickPreview
  } from '$lib/api';
  import TransactionDetailDrawer from './TransactionDetailDrawer.svelte';
  import PayeeCombobox from './PayeeCombobox.svelte';
  import BatchEntry from './BatchEntry.svelte';
  import { Dialog } from '@ark-ui/svelte/dialog';
  import { Portal } from '@ark-ui/svelte/portal';
  import {
    ArrowRight,
    Banknote,
    CheckCircle2,
    Clock3,
    FileText,
    ListPlus,
    RefreshCw,
    Save,
    Search,
    UsersRound,
    X
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import Fuse from 'fuse.js';

  interface DashboardData {
    date: string;
    totalOutgoingPaise: number;
    paymentCount: number;
    cashPaise: number;
    digitalPaise: number;
    reviewCount: number;
    recent: LedgerTransaction[];
    frequent: Array<{
      id: number;
      name: string;
      type: string;
      favourite: number;
      paymentCount: number;
      totalPaidPaise: number;
    }>;
  }
  interface TransactionPage {
    items: LedgerTransaction[];
    total: number;
    page: number;
    pageSize: number;
  }
  let data = $state<DashboardData | null>(null);
  let todaysItems = $state<LedgerTransaction[]>([]);
  let master = $state<MasterData>({ payees: [], categories: [], paymentMethods: [] });
  let command = $state('');
  let preview = $state<QuickPreview | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let inputElement = $state<HTMLInputElement>();
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let payeeId = $state('');
  let amount = $state('');
  let categoryId = $state('');
  let methodId = $state('');
  let note = $state('');
  let selected = $state<LedgerTransaction | null>(null);
  let detailedOpen = $state(false);
  let batchOpen = $state(false);
  let reviewOpen = $state(false);
  let reviewTransaction = $state<{ id: number; updatedAt: string } | null>(null);
  let reviewCategoryId = $state('');
  let newPayeeConfirmed = $state(false);
  let suggestionIndex = $state(0);
  const localNow = new Date();
  let manualDate = $state(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(localNow)
  );
  let manualTime = $state(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(localNow)
  );
  const uniquePayees = $derived(new Set(todaysItems.map((item) => item.payeeId)).size);
  const firstPaymentTime = $derived(
    todaysItems.at(-1) ? formatTime12(todaysItems.at(-1)!.transactionTime) : '—'
  );
  const latestPaymentTime = $derived(
    todaysItems[0] ? formatTime12(todaysItems[0].transactionTime) : '—'
  );
  const averagePayment = $derived(
    todaysItems.length
      ? Math.round(
          todaysItems.reduce((sum, item) => sum + item.amountPaise, 0) / todaysItems.length
        )
      : 0
  );
  const similarPayees = $derived.by(() => {
    if (!preview?.isNewPayee || !preview.payeeName) return [];
    return new Fuse(master.payees, {
      keys: ['name', 'aliases'],
      threshold: 0.42,
      includeScore: true
    })
      .search(preview.payeeName)
      .filter((result) => (result.score ?? 1) < 0.42)
      .slice(0, 3)
      .map((result) => result.item);
  });
  const commandPayeeSuggestions = $derived.by(() => {
    const trimmed = command.trim();
    if (!trimmed) return [];
    const amountStart = trimmed.search(/\s+(?=(?:₹|rs\.?\s*)?\d)/i);
    const term = (amountStart >= 0 ? trimmed.slice(0, amountStart) : trimmed).trim();
    if (
      term.length < 1 ||
      master.payees.some((payee) => payee.name.toLowerCase() === term.toLowerCase())
    )
      return [];
    const normalizedTerm = term.toLocaleLowerCase('en-IN');
    const prefixMatches = master.payees.filter((payee) =>
      [payee.name, ...payee.aliases].some((value) =>
        value
          .toLocaleLowerCase('en-IN')
          .split(/\s+/)
          .some((word) => word.startsWith(normalizedTerm))
      )
    );
    if (prefixMatches.length) return prefixMatches.slice(0, 6);
    return new Fuse(master.payees, {
      keys: ['name', 'aliases'],
      threshold: 0.32,
      includeScore: true
    })
      .search(term)
      .filter((result) => (result.score ?? 1) <= 0.32)
      .slice(0, 6)
      .map((result) => result.item);
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      const dashboard = await api<DashboardData>('/dashboard');
      const [masters, transactions] = await Promise.all([
        api<MasterData>('/master-data'),
        api<TransactionPage>(`/transactions${queryString({ date: dashboard.date, pageSize: 100 })}`)
      ]);
      data = dashboard;
      master = masters;
      todaysItems = transactions.items;
      if (!methodId)
        methodId = master.paymentMethods.find((item) => item.code === 'cash')?.id.toString() ?? '';
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Today could not be loaded';
    } finally {
      loading = false;
    }
  }
  function updatePreview(): void {
    newPayeeConfirmed = false;
    suggestionIndex = 0;
    if (previewTimer) clearTimeout(previewTimer);
    if (!command.trim()) {
      preview = null;
      return;
    }
    previewTimer = setTimeout(async () => {
      try {
        preview = await post<QuickPreview>('/quick-entry/preview', { command });
        error = '';
      } catch (caught) {
        preview = null;
        error = caught instanceof Error ? caught.message : 'Entry could not be parsed';
      }
    }, 130);
  }
  function chooseCommandPayee(payee: { name: string }): void {
    const trimmed = command.trim();
    const amountStart = trimmed.search(/\s+(?=(?:₹|rs\.?\s*)?\d)/i);
    const remainder = amountStart >= 0 ? trimmed.slice(amountStart).trim() : '';
    command = `${payee.name}${remainder ? ` ${remainder}` : ' '}`;
    updatePreview();
    inputElement?.focus();
  }
  function handleCommandKey(event: KeyboardEvent): void {
    if (commandPayeeSuggestions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        suggestionIndex = (suggestionIndex + 1) % commandPayeeSuggestions.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        suggestionIndex =
          (suggestionIndex - 1 + commandPayeeSuggestions.length) % commandPayeeSuggestions.length;
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const payee = commandPayeeSuggestions[suggestionIndex];
        if (payee) chooseCommandPayee(payee);
        return;
      }
      if (event.key === 'Escape') {
        suggestionIndex = -1;
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveSmart();
    }
  }
  async function saveSmart(): Promise<void> {
    if (
      !preview?.valid ||
      saving ||
      (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed)
    )
      return;
    saving = true;
    try {
      const result = await post<{
        transaction: { id: number; updatedAt: string; needsReview: boolean };
        duplicate: boolean;
        duplicateReason: string | null;
        createdPayee: boolean;
      }>('/quick-entry/save', { command });
      toast.success(result.duplicate ? 'Payment saved — possible duplicate' : 'Payment saved', {
        description: result.createdPayee
          ? 'New payee created. Cash used by default.'
          : (result.duplicateReason ?? 'Stored locally with an audit record.')
      });
      command = '';
      preview = null;
      await load();
      if (result.transaction.needsReview) {
        reviewTransaction = result.transaction;
        reviewCategoryId = '';
        reviewOpen = true;
      }
      inputElement?.focus();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Payment could not be saved';
    } finally {
      saving = false;
    }
  }
  async function saveManual(): Promise<void> {
    const amountPaise = rupeesToPaise(amount);
    if (!payeeId || !amountPaise || !categoryId || !methodId) {
      error = 'Choose a payee, amount, category, and payment method.';
      return;
    }
    saving = true;
    try {
      await post<{ id: number }>('/transactions', {
        payeeId: Number(payeeId),
        amountPaise,
        categoryId: Number(categoryId),
        paymentMethodId: Number(methodId),
        note: note.trim() || null,
        needsReview: false,
        transactionDate: manualDate,
        transactionTime: `${manualTime}:00`
      });
      detailedOpen = false;
      amount = '';
      note = '';
      toast.success('Detailed payment saved', {
        description: `${formatInr(amountPaise)} recorded.`
      });
      await load();
      inputElement?.focus();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Payment could not be saved';
    } finally {
      saving = false;
    }
  }
  async function completeReview(): Promise<void> {
    if (!reviewTransaction || !reviewCategoryId) return;
    try {
      await patch(`/transactions/${reviewTransaction.id}`, {
        categoryId: Number(reviewCategoryId),
        needsReview: false,
        expectedUpdatedAt: reviewTransaction.updatedAt
      });
      reviewOpen = false;
      reviewTransaction = null;
      toast.success('Payment review completed');
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Review could not be completed';
    }
  }
  function usePayee(payee: { name: string }): void {
    command = `${payee.name} `;
    updatePreview();
    inputElement?.focus();
  }
  function useSimilarPayee(payee: { name: string }): void {
    if (!preview?.payeeName) return;
    command = command.replace(
      new RegExp(`^${preview.payeeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      payee.name
    );
    updatePreview();
  }
  function selectManualPayee(
    payee = master.payees.find((item) => item.id === Number(payeeId)) ?? null
  ): void {
    if (!payee) return;
    categoryId = payee.defaultCategoryId?.toString() ?? categoryId;
    methodId = payee.defaultPaymentMethodId?.toString() ?? methodId;
  }
  onMount(() => {
    void load();
    inputElement?.focus();
  });
</script>

<div class="page-stack today-page today-command-layout">
  <header class="today-heading">
    <div><h1>Today</h1></div>
    <div class="today-header-actions">
      <button class="button quiet" onclick={() => void load()} disabled={loading}
        ><RefreshCw size={15} /> Refresh</button
      ><button class="button secondary" onclick={() => (batchOpen = true)}
        ><ListPlus size={15} /> Batch entry</button
      ><button class="button secondary detailed-trigger" onclick={() => (detailedOpen = true)}
        ><FileText size={15} /> Detailed entry</button
      >
    </div>
  </header>

  <section class="command-station" aria-label="Quick payment capture">
    <div class="command-line">
      <span class="command-symbol">₹</span><input
        bind:this={inputElement}
        bind:value={command}
        oninput={updatePreview}
        onkeydown={handleCommandKey}
        placeholder="Payee, amount, method, purpose…"
        aria-label="Quick payment command"
        autocomplete="off"
      /><span class="command-shortcut">Enter ↵</span>
    </div>
    {#if commandPayeeSuggestions.length && suggestionIndex >= 0}
      <div class="command-suggestions" role="listbox" aria-label="Payee suggestions">
        <small>Payee matches <kbd>↑↓</kbd> move <kbd>Tab</kbd> select</small>
        {#each commandPayeeSuggestions as payee, index}<button
            class:active={index === suggestionIndex}
            role="option"
            aria-selected={index === suggestionIndex}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => chooseCommandPayee(payee)}
            ><span class="suggestion-avatar">{payee.name.slice(0, 2).toUpperCase()}</span><span
              ><strong>{payee.name}</strong><small
                >{payee.type}{payee.aliases.length ? ` · ${payee.aliases.join(', ')}` : ''}</small
              ></span
            ><kbd>Tab</kbd></button
          >{/each}
      </div>
    {/if}
    <div class:invalid={Boolean(preview && !preview.valid)} class="parsed-preview">
      {#if preview}
        <div class="preview-leading">
          <span class="preview-state"
            >{#if preview.valid}<CheckCircle2 size={18} />{:else}<Search size={18} />{/if}</span
          >
          <div>
            <small>Parsed payment</small><strong
              >{preview.payeeName ?? 'Choose a known payee'} · {preview.amountPaise
                ? formatInr(preview.amountPaise)
                : 'Amount missing'}</strong
            >
          </div>
        </div>
        <div class="preview-meta">
          <span>{preview.paymentMethodName ?? 'Method required'}</span><span
            >{preview.categoryName ?? 'Category required'}</span
          ><span
            >{preview.transactionDate ?? data?.date ?? 'Today'} · {preview.transactionTime
              ? formatTime12(preview.transactionTime)
              : 'Now'}</span
          ><span>{preview.note ?? 'No purpose'}</span>
        </div>
        <button
          class="button payment-action"
          onclick={() => void saveSmart()}
          disabled={!preview.valid ||
            saving ||
            (preview.isNewPayee && similarPayees.length > 0 && !newPayeeConfirmed)}
          >{saving ? 'Saving…' : 'Save payment'}<ArrowRight size={16} /></button
        >
        {#if preview.errors.length || preview.warnings.length}<p class="preview-warning">
            {[...preview.errors, ...preview.warnings].join(' · ')}
          </p>{/if}
        {#if preview.isNewPayee && similarPayees.length && !newPayeeConfirmed}
          <div class="similar-payee-check">
            <strong>Similar payees exist</strong>
            {#each similarPayees as payee}<button onclick={() => useSimilarPayee(payee)}
                >Use {payee.name}</button
              >{/each}
            <button class="create-anyway" onclick={() => (newPayeeConfirmed = true)}
              >Create “{preview.payeeName}” anyway</button
            >
          </div>
        {/if}
      {:else}
        <div class="preview-idle">
          <Banknote size={17} /><span>Cash is the default payment method.</span><small
            >New payee names are created and sent to Review.</small
          >
        </div>
      {/if}
    </div>
    <div class="payee-chip-row" aria-label="Favourite and recent payees">
      <span class="chip-label">Quick payees</span>{#each data?.frequent ?? [] as payee}<button
          class:favourite-chip={Boolean(payee.favourite)}
          onclick={() => usePayee(payee)}
          >{#if payee.favourite}<span>★</span>{/if}{payee.name}</button
        >{:else}<small>Add payees in Payees to create shortcuts.</small>{/each}
    </div>
  </section>

  {#if error}<div class="notice error">
      <span>{error}</span><button onclick={() => (error = '')}>Dismiss</button>
    </div>{/if}

  <section class="today-summary compact-summary" aria-label="Today's totals">
    <article>
      <span>Total outgoing</span><strong>{formatInr(data?.totalOutgoingPaise ?? 0)}</strong><small
        >{data?.paymentCount ?? 0} payments</small
      >
    </article>
    <article>
      <span>Cash</span><strong>{formatInr(data?.cashPaise ?? 0)}</strong><small
        >{todaysItems.filter((item) => item.paymentMethodCode === 'cash').length} payments · {data?.totalOutgoingPaise
          ? Math.round((data.cashPaise / data.totalOutgoingPaise) * 100)
          : 0}%</small
      >
    </article>
    <article>
      <span>Digital</span><strong>{formatInr(data?.digitalPaise ?? 0)}</strong><small
        >UPI, bank and cheque</small
      >
    </article>
    <article class:warning={Boolean(data?.reviewCount)}>
      <span>Needs review</span><strong>{data?.reviewCount ?? 0}</strong><small
        >{data?.reviewCount ? 'Resolve before finishing' : 'Nothing pending'}</small
      >
    </article>
  </section>

  <section class="today-operations">
    <div class="payments-surface">
      <header>
        <div>
          <h2>Recent payments</h2>
          <p>Click a payment to inspect its note and audit history.</p>
        </div>
        <span>{todaysItems.length} shown</span>
      </header>
      <div class="payment-row-list">
        {#each todaysItems.slice(0, 12) as item}<button
            class:review-payment={item.needsReview}
            onclick={() => (selected = item)}
            ><span class="payment-row-main"
              ><strong>{item.payeeName}</strong><b>{formatInr(item.amountPaise)}</b></span
            ><span class="payment-row-meta"
              ><span class:cash-method={item.paymentMethodCode === 'cash'}
                >{item.paymentMethodName ?? 'Needs review'}</span
              ><span>{item.note ?? 'No purpose entered'}</span><time
                >{formatTime12(item.transactionTime)}</time
              ></span
            ></button
          >{:else}<div class="empty-payment-state">
            <Banknote size={24} /><strong>No payments yet</strong><span
              >Use the command field above to record the first one.</span
            >
          </div>{/each}
      </div>
    </div>

    <aside class="day-status-card">
      <header>
        <span class="status-dot"></span>
        <div>
          <h2>Day status</h2>
          <p>{data?.date ?? 'Today'}</p>
        </div>
      </header>
      <dl>
        <div>
          <dt><Clock3 size={15} /> First payment</dt>
          <dd>{firstPaymentTime}</dd>
        </div>
        <div>
          <dt><Clock3 size={15} /> Latest payment</dt>
          <dd>{latestPaymentTime}</dd>
        </div>
        <div>
          <dt><UsersRound size={15} /> Unique payees</dt>
          <dd>{uniquePayees}</dd>
        </div>
        <div>
          <dt><Banknote size={15} /> Average payment</dt>
          <dd>{formatInr(averagePayment)}</dd>
        </div>
      </dl>
      <small class="status-footnote">Corrections and voids are available in Ledger.</small>
    </aside>
  </section>
</div>

{#if selected}<TransactionDetailDrawer
    transaction={selected}
    onclose={() => (selected = null)}
  />{/if}
{#if batchOpen}<BatchEntry
    {master}
    onclose={() => (batchOpen = false)}
    onsaved={() => void load()}
  />{/if}

<Dialog.Root bind:open={detailedOpen} lazyMount unmountOnExit>
  <Portal
    ><Dialog.Backdrop class="drawer-backdrop" /><Dialog.Positioner class="drawer-positioner"
      ><Dialog.Content class="drawer detailed-entry-drawer"
        ><header>
          <div>
            <p class="eyebrow">Complete payment record</p>
            <Dialog.Title>Detailed entry</Dialog.Title><Dialog.Description
              >Use this when the command line is not enough.</Dialog.Description
            >
          </div>
          <Dialog.CloseTrigger class="icon-button" aria-label="Close detailed entry"
            ><X size={18} /></Dialog.CloseTrigger
          >
        </header>
        <form
          class="drawer-body detailed-form"
          onsubmit={(event) => {
            event.preventDefault();
            void saveManual();
          }}
        >
          <PayeeCombobox payees={master.payees} bind:value={payeeId} onchange={selectManualPayee} />
          <div class="field-row">
            <label>Date<input type="date" bind:value={manualDate} /></label>
            <label>Time<input type="time" bind:value={manualTime} /></label>
          </div>
          <label
            >Amount in rupees<input
              bind:value={amount}
              inputmode="decimal"
              placeholder="800"
            /></label
          ><label
            >Payment method<select bind:value={methodId}
              >{#each master.paymentMethods.filter((item) => item.active) as item}<option
                  value={item.id}>{item.displayName}</option
                >{/each}</select
            ></label
          ><label
            >Category<select bind:value={categoryId}
              ><option value="">Choose category</option
              >{#each master.categories.filter((item) => item.active) as item}<option
                  value={item.id}>{item.name}</option
                >{/each}</select
            ></label
          ><label
            >Purpose or note<textarea
              bind:value={note}
              rows="4"
              placeholder="What was this payment for?"></textarea></label
          ><button class="button payment-action wide" disabled={saving}
            ><Save size={16} />{saving ? 'Saving…' : 'Save detailed payment'}</button
          >
        </form></Dialog.Content
      ></Dialog.Positioner
    ></Portal
  >
</Dialog.Root>

<Dialog.Root bind:open={reviewOpen} lazyMount unmountOnExit>
  <Portal
    ><Dialog.Backdrop class="drawer-backdrop" /><Dialog.Positioner class="review-dialog-positioner"
      ><Dialog.Content class="review-dialog"
        ><header>
          <div>
            <p class="eyebrow">Payment recorded</p>
            <Dialog.Title>Choose a category</Dialog.Title><Dialog.Description
              >Complete this now, or leave it in Review for later.</Dialog.Description
            >
          </div>
          <Dialog.CloseTrigger class="icon-button" aria-label="Skip payment review"
            ><X size={18} /></Dialog.CloseTrigger
          >
        </header>
        <div class="review-dialog-body">
          <label
            >Category<select bind:value={reviewCategoryId}>
              <option value="">Choose category</option>
              {#each master.categories.filter((item) => item.active) as item}<option value={item.id}
                  >{item.name}</option
                >{/each}
            </select></label
          >
          <p class="review-note">Cash has already been selected as the default method.</p>
          <div class="form-actions">
            <Dialog.CloseTrigger class="button secondary">Skip for now</Dialog.CloseTrigger><button
              class="button primary"
              disabled={!reviewCategoryId}
              onclick={() => void completeReview()}>Complete review</button
            >
          </div>
        </div></Dialog.Content
      ></Dialog.Positioner
    ></Portal
  >
</Dialog.Root>
