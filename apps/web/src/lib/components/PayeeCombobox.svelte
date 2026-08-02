<script lang="ts">
  import { Combobox, createListCollection } from '@ark-ui/svelte/combobox';
  import { Check, ChevronsUpDown, Search, UserRound, Building2 } from '@lucide/svelte';
  import Fuse from 'fuse.js';
  import type { Payee } from '$lib/api';

  let {
    payees,
    value = $bindable(''),
    onchange,
    label = 'Payee'
  }: {
    payees: Payee[];
    value?: string;
    onchange?: (payee: Payee | null) => void;
    label?: string;
  } = $props();
  let query = $state('');
  const activePayees = $derived(payees.filter((payee) => payee.active));
  const fuse = $derived(
    new Fuse(activePayees, {
      keys: [
        { name: 'name', weight: 0.8 },
        { name: 'aliases', weight: 0.2 }
      ],
      threshold: 0.32,
      ignoreLocation: true
    })
  );
  const matches = $derived(
    query.trim()
      ? fuse.search(query, { limit: 10 }).map((result) => result.item)
      : activePayees.slice(0, 10)
  );
  const collection = $derived(
    createListCollection({
      items: matches,
      itemToString: (item) => item.name,
      itemToValue: (item) => String(item.id)
    })
  );

  function select(details: { value: string[] }): void {
    value = details.value[0] ?? '';
    onchange?.(activePayees.find((payee) => String(payee.id) === value) ?? null);
  }
</script>

<Combobox.Root
  {collection}
  value={value ? [value] : []}
  inputValue={query}
  onInputValueChange={(details) => (query = details.inputValue)}
  onValueChange={select}
  inputBehavior="autohighlight"
  openOnClick
  positioning={{ sameWidth: true }}
>
  <Combobox.Label class="field-label">{label}</Combobox.Label>
  <Combobox.Control class="combo-control">
    <Search size={15} aria-hidden="true" />
    <Combobox.Input placeholder="Search name or alias…" />
    <Combobox.Trigger aria-label="Show payees"><ChevronsUpDown size={15} /></Combobox.Trigger>
  </Combobox.Control>
  <Combobox.Positioner class="combo-positioner">
    <Combobox.Content class="combo-content">
      <Combobox.Empty class="combo-empty">No matching payee</Combobox.Empty>
      <Combobox.ItemGroup>
        {#each collection.items as payee}
          <Combobox.Item item={payee} class="combo-item">
            <span class="combo-avatar"
              >{#if payee.type === 'company'}<Building2 size={15} />{:else}<UserRound
                  size={15}
                />{/if}</span
            >
            <span
              ><Combobox.ItemText>{payee.name}</Combobox.ItemText><small
                >{payee.type} · {payee.paymentCount} payments</small
              ></span
            >
            <Combobox.ItemIndicator><Check size={15} /></Combobox.ItemIndicator>
          </Combobox.Item>
        {/each}
      </Combobox.ItemGroup>
    </Combobox.Content>
  </Combobox.Positioner>
</Combobox.Root>
