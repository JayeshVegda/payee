<script lang="ts">
  import { api, formatInr, formatTime12, type LedgerTransaction } from '$lib/api';
  import { Dialog } from '@ark-ui/svelte/dialog';
  import { Portal } from '@ark-ui/svelte/portal';
  import { X } from '@lucide/svelte';

  let {
    transaction,
    transactionId,
    onclose
  }: {
    transaction?: LedgerTransaction | null;
    transactionId?: number | null;
    onclose: () => void;
  } = $props();
  let item = $state<LedgerTransaction | null>(null);
  let audit = $state<
    Array<{ id: number; action: string; changedAt: string; changeSource: string }>
  >([]);
  let error = $state('');

  $effect(() => {
    const id = transaction?.id ?? transactionId;
    if (!id) return;
    void Promise.all([
      transaction ? Promise.resolve(transaction) : api<LedgerTransaction>(`/transactions/${id}`),
      api<Array<{ id: number; action: string; changedAt: string; changeSource: string }>>(
        `/transactions/${id}/audit`
      )
    ])
      .then(([loaded, history]) => {
        item = loaded;
        audit = history;
      })
      .catch((caught) => {
        error = caught instanceof Error ? caught.message : 'Details could not be loaded';
      });
  });
</script>

<Dialog.Root open onOpenChange={(details) => !details.open && onclose()} lazyMount>
  <Portal>
    <Dialog.Backdrop class="drawer-backdrop" />
    <Dialog.Positioner class="drawer-positioner">
      <Dialog.Content class="drawer transaction-preview" aria-live="polite">
        <header>
          <div>
            <p class="eyebrow">Payment details</p>
            <Dialog.Title>{item?.payeeName ?? 'Loading…'}</Dialog.Title>
            <Dialog.Description>
              {item
                ? `${item.transactionDate} at ${formatTime12(item.transactionTime)}`
                : 'Fetching record'}
            </Dialog.Description>
          </div>
          <Dialog.CloseTrigger class="icon-button" aria-label="Close payment details"
            ><X size={18} /></Dialog.CloseTrigger
          >
        </header>
        {#if error}<div class="notice error">{error}</div>{/if}
        {#if item}
          <div class="drawer-body">
            <div class="detail-amount">
              <small>Amount paid</small><strong>{formatInr(item.amountPaise)}</strong><span
                class:cash-chip={item.paymentMethodCode === 'cash'}
                >{item.paymentMethodName ?? 'Needs review'}</span
              >
            </div>
            <dl class="detail-grid">
              <div>
                <dt>Payee</dt>
                <dd>{item.payeeName}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{item.categoryName ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{item.transactionDate}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{formatTime12(item.transactionTime)}</dd>
              </div>
              <div>
                <dt>Entered from</dt>
                <dd>{item.source}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{item.status}{item.needsReview ? ' · needs review' : ''}</dd>
              </div>
            </dl>
            <section class="detail-note">
              <small>Purpose or note</small>
              <p>{item.note ?? 'No note was entered for this payment.'}</p>
            </section>
            <div class="audit-list">
              <h3>Record history</h3>
              {#each audit as entry}<article>
                  <span class="audit-mark"></span>
                  <div>
                    <strong>{entry.action}</strong><small
                      >{new Date(entry.changedAt).toLocaleString('en-IN')} · {entry.changeSource}</small
                    >
                  </div>
                </article>{:else}<p class="empty">No audit events found.</p>{/each}
            </div>
            <p class="detail-hint">Open this payment in Ledger to correct or void it.</p>
          </div>
        {/if}
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog.Root>
