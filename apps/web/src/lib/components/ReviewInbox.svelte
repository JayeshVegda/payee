<script lang="ts">
  import { onMount } from 'svelte';
  import {
    api,
    formatInr,
    formatTime12,
    patch,
    type LedgerTransaction,
    type MasterData
  } from '$lib/api';
  import { Check, Inbox, RefreshCw } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';

  interface Page {
    items: LedgerTransaction[];
    total: number;
    page: number;
    pageSize: number;
  }
  let items = $state<LedgerTransaction[]>([]);
  let master = $state<MasterData>({ payees: [], categories: [], paymentMethods: [] });
  let drafts = $state<Record<number, { categoryId: string; methodId: string; remember: boolean }>>(
    {}
  );
  let loading = $state(true);
  let error = $state('');

  async function load(): Promise<void> {
    loading = true;
    try {
      const [page, data] = await Promise.all([
        api<Page>('/transactions?reviewOnly=true&pageSize=100'),
        api<MasterData>('/master-data')
      ]);
      items = page.items;
      master = data;
      drafts = Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            categoryId: item.categoryId?.toString() ?? '',
            methodId:
              item.paymentMethodId?.toString() ??
              data.paymentMethods.find((method) => method.code === 'cash')?.id.toString() ??
              '',
            remember: false
          }
        ])
      );
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Review inbox could not be loaded';
    } finally {
      loading = false;
    }
  }

  async function resolve(item: LedgerTransaction): Promise<void> {
    const draft = drafts[item.id];
    if (!draft?.categoryId || !draft.methodId) return;
    try {
      await patch(`/transactions/${item.id}`, {
        categoryId: Number(draft.categoryId),
        paymentMethodId: Number(draft.methodId),
        needsReview: false,
        expectedUpdatedAt: item.updatedAt
      });
      if (draft.remember) {
        await patch(`/payees/${item.payeeId}`, {
          defaultCategoryId: Number(draft.categoryId),
          defaultPaymentMethodId: Number(draft.methodId)
        });
      }
      toast.success('Review completed', {
        description: draft.remember
          ? 'Payee defaults remembered.'
          : 'Only this payment was changed.'
      });
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Review could not be saved';
    }
  }

  onMount(() => void load());
</script>

<div class="page-stack review-inbox-page">
  <header class="page-header">
    <div><h1>Review inbox</h1></div>
    <button class="button secondary" onclick={() => void load()} disabled={loading}
      ><RefreshCw size={14} /> Refresh</button
    >
  </header>
  {#if error}<div class="notice error">{error}</div>{/if}
  <section class="review-inbox-summary">
    <Inbox size={18} /><strong>{items.length}</strong><span
      >{items.length === 1 ? 'payment needs' : 'payments need'} attention</span
    >
  </section>
  <section class="review-inbox-list">
    {#each items as item}
      {@const draft = drafts[item.id]}
      <article>
        <div class="review-payment-identity">
          <small>{item.transactionDate} · {formatTime12(item.transactionTime)}</small>
          <strong>{item.payeeName}</strong>
          <b>{formatInr(item.amountPaise)}</b>
          <p>{item.note ?? 'No purpose entered'}</p>
        </div>
        {#if draft}<div class="review-fields">
            <label
              >Category<select bind:value={draft.categoryId}
                ><option value="">Choose category</option
                >{#each master.categories as category}<option value={category.id}
                    >{category.name}</option
                  >{/each}</select
              ></label
            >
            <label
              >Method<select bind:value={draft.methodId}
                >{#each master.paymentMethods as method}<option value={method.id}
                    >{method.displayName}</option
                  >{/each}</select
              ></label
            >
            <label class="check remember-default"
              ><input type="checkbox" bind:checked={draft.remember} /> Remember for this payee</label
            >
            <button
              class="button primary"
              disabled={!draft.categoryId || !draft.methodId}
              onclick={() => void resolve(item)}><Check size={14} /> Complete</button
            >
          </div>{/if}
      </article>
    {:else}<div class="review-empty">
        <Check size={24} /><strong>Inbox cleared</strong><span
          >New payees and incomplete payments will appear here.</span
        >
      </div>{/each}
  </section>
</div>
