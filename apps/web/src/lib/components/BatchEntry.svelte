<script lang="ts">
  import { post, rupeesToPaise, type MasterData } from '$lib/api';
  import { Plus, Trash2, X } from '@lucide/svelte';
  import { Dialog } from '@ark-ui/svelte/dialog';
  import { Portal } from '@ark-ui/svelte/portal';
  import { toast } from 'svelte-sonner';

  let {
    master,
    onclose,
    onsaved
  }: { master: MasterData; onclose: () => void; onsaved: () => void } = $props();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  type Row = {
    payeeId: number | '';
    amount: string;
    categoryId: number | '';
    methodId: number | '';
    date: string;
    note: string;
  };
  const blank = (): Row => ({
    payeeId: '',
    amount: '',
    categoryId: '',
    methodId: master.paymentMethods.find((method) => method.code === 'cash')?.id ?? '',
    date: today,
    note: ''
  });
  let rows = $state<Row[]>([blank(), blank(), blank()]);
  let saving = $state(false);
  let error = $state('');

  async function save(): Promise<void> {
    const active = rows.filter((row) => row.payeeId || row.amount);
    const parsed = active.map((row) => ({ ...row, amountPaise: rupeesToPaise(row.amount) }));
    if (!active.length || parsed.some((row) => !row.payeeId || !row.amountPaise || !row.date)) {
      error = 'Every used row needs a payee, valid amount, and date.';
      return;
    }
    saving = true;
    try {
      await post('/transactions/batch', {
        rows: parsed.map((row) => ({
          payeeId: Number(row.payeeId),
          amountPaise: row.amountPaise,
          categoryId: row.categoryId ? Number(row.categoryId) : null,
          paymentMethodId: row.methodId ? Number(row.methodId) : null,
          transactionDate: row.date,
          note: row.note.trim() || null
        }))
      });
      toast.success(`${active.length} payments recorded`, {
        description: 'The batch was saved atomically.'
      });
      onsaved();
      onclose();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Batch could not be saved';
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root open onOpenChange={(details) => !details.open && onclose()} lazyMount>
  <Portal
    ><Dialog.Backdrop class="drawer-backdrop" /><Dialog.Positioner class="batch-positioner"
      ><Dialog.Content class="batch-dialog">
        <header>
          <div>
            <p class="eyebrow">Several payments</p>
            <Dialog.Title>Batch payment desk</Dialog.Title><Dialog.Description
              >Record up to 100 current or backdated payments in one audited batch.</Dialog.Description
            >
          </div>
          <Dialog.CloseTrigger class="icon-button"><X size={18} /></Dialog.CloseTrigger>
        </header>
        {#if error}<div class="notice error">{error}</div>{/if}
        <div class="batch-rows">
          <div class="batch-row batch-row-heading" aria-hidden="true">
            <span>Payee</span><span>Amount</span><span>Date</span><span>Category</span><span
              >Method</span
            ><span>Purpose</span><span></span>
          </div>
          {#each rows as row, index}<div class="batch-row">
              <label
                ><span>Payee</span><select bind:value={row.payeeId}
                  ><option value="">Choose payee</option>{#each master.payees as payee}<option
                      value={payee.id}>{payee.name}</option
                    >{/each}</select
                ></label
              >
              <label
                ><span>Amount</span><input
                  bind:value={row.amount}
                  inputmode="decimal"
                  placeholder="800"
                /></label
              >
              <label><span>Date</span><input type="date" bind:value={row.date} /></label>
              <label
                ><span>Category</span><select bind:value={row.categoryId}
                  ><option value="">Review later</option
                  >{#each master.categories as category}<option value={category.id}
                      >{category.name}</option
                    >{/each}</select
                ></label
              >
              <label
                ><span>Method</span><select bind:value={row.methodId}
                  >{#each master.paymentMethods as method}<option value={method.id}
                      >{method.displayName}</option
                    >{/each}</select
                ></label
              >
              <label
                ><span>Purpose</span><input bind:value={row.note} placeholder="Optional" /></label
              >
              <button
                class="icon-button"
                aria-label={`Remove row ${index + 1}`}
                onclick={() => rows.splice(index, 1)}><Trash2 size={14} /></button
              >
            </div>{/each}
        </div>
        <footer>
          <button class="button secondary" onclick={() => rows.push(blank())}
            ><Plus size={14} /> Add row</button
          ><button class="button primary" disabled={saving} onclick={() => void save()}
            >{saving ? 'Saving…' : 'Record batch'}</button
          >
        </footer>
      </Dialog.Content></Dialog.Positioner
    ></Portal
  >
</Dialog.Root>
