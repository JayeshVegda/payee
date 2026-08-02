<script lang="ts">
  import { onMount } from 'svelte';
  import {
    api,
    formatInr,
    patch,
    post,
    type Category,
    type MasterData,
    type Payee
  } from '$lib/api';
  import PayeeProfileDrawer from './PayeeProfileDrawer.svelte';

  let master = $state<MasterData>({ payees: [], categories: [], paymentMethods: [] });
  let activeTab = $state<'payees' | 'categories' | 'methods'>('payees');
  let error = $state('');
  let message = $state('');
  let editingPayee = $state<number | null>(null);
  let payeeName = $state('');
  let payeeType = $state<'person' | 'company'>('person');
  let aliases = $state('');
  let categoryId = $state('');
  let methodId = $state('');
  let favourite = $state(false);
  let notes = $state('');
  let profile = $state<Payee | null>(null);
  let editingCategory = $state<number | null>(null);
  let categoryName = $state('');
  let categoryAliases = $state('');
  let sortOrder = $state('0');

  async function load(): Promise<void> {
    try {
      master = await api<MasterData>('/master-data?includeInactive=true');
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Master data could not be loaded';
    }
  }

  function resetPayee(): void {
    editingPayee = null;
    payeeName = '';
    payeeType = 'person';
    aliases = '';
    categoryId = '';
    methodId = '';
    favourite = false;
    notes = '';
  }

  function editPayee(payee: Payee): void {
    editingPayee = payee.id;
    payeeName = payee.name;
    payeeType = payee.type;
    aliases = payee.aliases.join(', ');
    categoryId = payee.defaultCategoryId?.toString() ?? '';
    methodId = payee.defaultPaymentMethodId?.toString() ?? '';
    favourite = payee.favourite;
    notes = payee.notes ?? '';
  }

  async function savePayee(): Promise<void> {
    const payload = {
      name: payeeName,
      type: payeeType,
      aliases: aliases
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      defaultCategoryId: categoryId ? Number(categoryId) : null,
      defaultPaymentMethodId: methodId ? Number(methodId) : null,
      favourite,
      notes: notes || null
    };
    try {
      if (editingPayee) await patch(`/payees/${editingPayee}`, payload);
      else await post('/payees', payload);
      message = editingPayee ? 'Payee updated.' : 'Payee added.';
      resetPayee();
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Payee could not be saved';
    }
  }

  async function togglePayee(payee: Payee): Promise<void> {
    await patch(`/payees/${payee.id}`, { active: !payee.active });
    await load();
  }

  function editCategory(category: Category): void {
    editingCategory = category.id;
    categoryName = category.name;
    categoryAliases = category.aliases
      .filter((alias) => alias.toLowerCase() !== category.name.toLowerCase())
      .join(', ');
    sortOrder = String(category.sortOrder);
  }

  function resetCategory(): void {
    editingCategory = null;
    categoryName = '';
    categoryAliases = '';
    sortOrder = '0';
  }

  async function saveCategory(): Promise<void> {
    const payload = {
      name: categoryName,
      aliases: categoryAliases
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      sortOrder: Number(sortOrder) || 0
    };
    try {
      if (editingCategory) await patch(`/categories/${editingCategory}`, payload);
      else await post('/categories', payload);
      message = editingCategory ? 'Category updated.' : 'Category added.';
      resetCategory();
      await load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Category could not be saved';
    }
  }

  async function toggleCategory(category: Category): Promise<void> {
    await patch(`/categories/${category.id}`, { active: !category.active });
    await load();
  }

  onMount(() => void load());
</script>

<div class="page-stack">
  <header class="page-header">
    <div>
      <h1>Payees</h1>
    </div>
  </header>

  <nav class="subtabs" aria-label="Master data sections">
    <button class:active={activeTab === 'payees'} onclick={() => (activeTab = 'payees')}
      >Payees <span>{master.payees.length}</span></button
    >
    <button class:active={activeTab === 'categories'} onclick={() => (activeTab = 'categories')}
      >Categories <span>{master.categories.length}</span></button
    >
    <button class:active={activeTab === 'methods'} onclick={() => (activeTab = 'methods')}
      >Payment methods <span>{master.paymentMethods.length}</span></button
    >
  </nav>

  {#if message || error}<div class:error={Boolean(error)} class="notice">
      {error || message}
    </div>{/if}

  {#if activeTab === 'payees'}
    <section class="master-layout">
      <div class="master-sidebar">
        <form
          class="panel form-panel"
          onsubmit={(event) => {
            event.preventDefault();
            void savePayee();
          }}
        >
          <div class="panel-heading">
            <div>
              <h2>{editingPayee ? 'Edit payee' : 'Add a payee'}</h2>
              <p>People and companies you pay</p>
            </div>
          </div>
          <label
            >Name<input
              bind:value={payeeName}
              required
              placeholder="Ramesh Kumar or ABC Tools"
            /></label
          >
          <div class="field-row">
            <label
              >Type<select bind:value={payeeType}
                ><option value="person">Person</option><option value="company">Company</option
                ></select
              ></label
            >
            <label class="checkbox-field"
              ><input type="checkbox" bind:checked={favourite} /> Favourite shortcut</label
            >
          </div>
          <label
            >Aliases<input bind:value={aliases} placeholder="ramesh, ramesh bhai" /><small
              >Comma-separated names accepted by quick entry</small
            ></label
          >
          <div class="field-row">
            <label
              >Default category<select bind:value={categoryId}
                ><option value="">No default</option
                >{#each master.categories.filter((item) => item.active) as item}<option
                    value={item.id}>{item.name}</option
                  >{/each}</select
              ></label
            >
            <label
              >Default method<select bind:value={methodId}
                ><option value="">No default</option
                >{#each master.paymentMethods.filter((item) => item.active) as item}<option
                    value={item.id}>{item.displayName}</option
                  >{/each}</select
              ></label
            >
          </div>
          <label
            >Notes<textarea bind:value={notes} rows="3" placeholder="Optional reference"
            ></textarea></label
          >
          <div class="form-actions">
            <button class="button primary" type="submit"
              >{editingPayee ? 'Save changes' : 'Add payee'}</button
            >{#if editingPayee}<button class="button secondary" type="button" onclick={resetPayee}
                >Cancel</button
              >{/if}
          </div>
        </form>
        <aside class="panel recent-payees-card">
          <div class="panel-heading">
            <div>
              <h2>Recently added</h2>
              <p>Your newest payment contacts</p>
            </div>
          </div>
          <div class="recent-payee-list">
            {#each [...master.payees]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 4) as payee}
              <button onclick={() => editPayee(payee)}>
                <span>{payee.name.slice(0, 2).toUpperCase()}</span>
                <span
                  ><strong>{payee.name}</strong><small
                    >{payee.type} · {payee.aliases.length} aliases</small
                  ></span
                >
              </button>
            {:else}<p class="empty">New payees will appear here.</p>{/each}
          </div>
        </aside>
      </div>

      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>Payee directory</h2>
            <p>Inactive payees remain in historical ledgers</p>
          </div>
        </div>
        <div class="directory-list">
          {#each master.payees as payee}
            <article class:inactive={!payee.active}>
              <span class="avatar">{payee.name.slice(0, 2).toUpperCase()}</span>
              <div class="directory-main">
                <div>
                  <button class="payee-name-link" onclick={() => (profile = payee)}
                    >{payee.name}</button
                  >{#if payee.favourite}<span class="favourite">★</span>{/if}<span class="tag"
                    >{payee.type}</span
                  >
                </div>
                <small
                  >{payee.aliases.length ? payee.aliases.join(' · ') : 'No aliases'} · {payee.paymentCount}
                  payments · {formatInr(payee.totalPaidPaise)}</small
                >
              </div>
              <button class="text-button" onclick={() => editPayee(payee)}>Edit</button>
              <button class="text-button" onclick={() => void togglePayee(payee)}
                >{payee.active ? 'Deactivate' : 'Activate'}</button
              >
            </article>
          {:else}<p class="empty">Add the first worker, supplier, or company.</p>{/each}
        </div>
      </div>
    </section>
  {:else if activeTab === 'categories'}
    <section class="master-layout">
      <form
        class="panel form-panel"
        onsubmit={(event) => {
          event.preventDefault();
          void saveCategory();
        }}
      >
        <div class="panel-heading">
          <div>
            <h2>{editingCategory ? 'Edit category' : 'Add category'}</h2>
            <p>Purpose groups and parser keywords</p>
          </div>
        </div>
        <label>Name<input bind:value={categoryName} required placeholder="Site materials" /></label>
        <label
          >Keywords<input
            bind:value={categoryAliases}
            placeholder="cement, steel, material"
          /><small>Comma-separated quick-entry words</small></label
        >
        <label>Sort order<input bind:value={sortOrder} type="number" /></label>
        <div class="form-actions">
          <button class="button primary">{editingCategory ? 'Save changes' : 'Add category'}</button
          >{#if editingCategory}<button
              type="button"
              class="button secondary"
              onclick={resetCategory}>Cancel</button
            >{/if}
        </div>
      </form>
      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>Categories</h2>
            <p>Ordered for capture and reports</p>
          </div>
        </div>
        <div class="directory-list">
          {#each master.categories as category}<article class:inactive={!category.active}>
              <span class="category-mark">{category.sortOrder}</span>
              <div class="directory-main">
                <strong>{category.name}</strong><small
                  >{category.aliases.join(' · ') || 'No keywords'}</small
                >
              </div>
              <button class="text-button" onclick={() => editCategory(category)}>Edit</button
              ><button class="text-button" onclick={() => void toggleCategory(category)}
                >{category.active ? 'Deactivate' : 'Activate'}</button
              >
            </article>{/each}
        </div>
      </div>
    </section>
  {:else}
    <section class="panel narrow-panel">
      <div class="panel-heading">
        <div>
          <h2>Payment methods</h2>
          <p>Stable accounting codes used by capture and reports</p>
        </div>
      </div>
      <div class="method-grid">
        {#each master.paymentMethods as method}<article class:inactive={!method.active}>
            <span class="method-code">{method.code}</span>
            <div>
              <strong>{method.displayName}</strong><small>Parser code: {method.code}</small>
            </div>
            <button
              class="button secondary"
              onclick={async () => {
                await patch(`/payment-methods/${method.id}`, { active: !method.active });
                await load();
              }}>{method.active ? 'Deactivate' : 'Activate'}</button
            >
          </article>{/each}
      </div>
    </section>
  {/if}
</div>
{#if profile}<PayeeProfileDrawer payee={profile} onclose={() => (profile = null)} />{/if}
