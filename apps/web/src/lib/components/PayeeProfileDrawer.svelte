<script lang="ts">
  import { onMount } from 'svelte';
  import { api, formatInr, formatTime12, type LedgerTransaction, type Payee } from '$lib/api';
  import { Dialog } from '@ark-ui/svelte/dialog';
  import { Portal } from '@ark-ui/svelte/portal';
  import { X } from '@lucide/svelte';
  let { payee, onclose }: { payee: Payee; onclose: () => void } = $props();
  let items = $state<LedgerTransaction[]>([]);
  onMount(async () => { items = (await api<{items: LedgerTransaction[]}>(`/transactions?payeeId=${payee.id}&pageSize=20&includeVoided=true`)).items; });
</script>
<Dialog.Root open onOpenChange={(details) => !details.open && onclose()} lazyMount><Portal>
  <Dialog.Backdrop class="drawer-backdrop" /><Dialog.Positioner class="drawer-positioner"><Dialog.Content class="drawer payee-profile-drawer">
    <header><div><p class="eyebrow">Payee profile</p><Dialog.Title>{payee.name}</Dialog.Title><Dialog.Description>{payee.type} · {payee.active ? 'Active' : 'Inactive'}</Dialog.Description></div><Dialog.CloseTrigger class="icon-button"><X size={18} /></Dialog.CloseTrigger></header>
    <div class="drawer-body"><section class="payee-profile-stats"><div><small>Total paid</small><strong>{formatInr(payee.totalPaidPaise)}</strong></div><div><small>Payments</small><strong>{payee.paymentCount}</strong></div><div><small>Average</small><strong>{formatInr(payee.paymentCount ? Math.round(payee.totalPaidPaise / payee.paymentCount) : 0)}</strong></div></section>
      <dl class="detail-grid"><div><dt>Aliases</dt><dd>{payee.aliases.join(', ') || 'None'}</dd></div><div><dt>Favourite</dt><dd>{payee.favourite ? 'Yes' : 'No'}</dd></div><div><dt>Notes</dt><dd>{payee.notes || 'None'}</dd></div></dl>
      <section class="profile-history"><h3>Recent payments</h3>{#each items as item}<article><span><strong>{item.transactionDate} · {formatTime12(item.transactionTime)}</strong><small>{item.categoryName ?? 'Needs review'} · {item.note ?? 'No purpose'}</small></span><b>{formatInr(item.amountPaise)}</b></article>{:else}<p class="empty">No payments yet.</p>{/each}</section>
    </div>
  </Dialog.Content></Dialog.Positioner>
</Portal></Dialog.Root>
