<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from '$lib/components/Dashboard.svelte';
  import Ledger from '$lib/components/Ledger.svelte';
  import Masters from '$lib/components/Masters.svelte';
  import Reports from '$lib/components/Reports.svelte';
  import ReviewInbox from '$lib/components/ReviewInbox.svelte';
  import ActivityLog from '$lib/components/ActivityLog.svelte';
  import SystemDashboard from '$lib/components/SystemDashboard.svelte';
  import { Circle } from '@lucide/svelte';

  type View = 'today' | 'ledger' | 'review' | 'masters' | 'activity' | 'system' | 'reports';
  const navigation: Array<{ id: View; label: string; key: string }> = [
    { id: 'today', label: 'Today', key: '1' },
    { id: 'ledger', label: 'Ledger', key: '2' },
    { id: 'review', label: 'Review', key: '3' },
    { id: 'masters', label: 'Payees', key: '4' },
    { id: 'activity', label: 'Activity', key: '5' },
    { id: 'system', label: 'System', key: '6' },
    { id: 'reports', label: 'Reports', key: '7' }
  ];
  let activeView = $state<View>('today');
  let now = $state(new Date());

  function handleShortcut(event: KeyboardEvent): void {
    if (!event.altKey) return;
    const item = navigation.find((entry) => entry.key === event.key);
    if (item) {
      event.preventDefault();
      activeView = item.id;
    }
  }

  onMount(() => {
    const timer = window.setInterval(() => (now = new Date()), 30_000);
    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', handleShortcut);
    };
  });
</script>

<svelte:head>
  <title>Payment Ledger</title>
  <meta name="description" content="Private local payment tracking and daily cashbook" />
</svelte:head>

<div class="payment-desk-shell">
  <header class="top-navigation">
    <button class="top-brand" onclick={() => (activeView = 'today')} aria-label="Payment Desk home"
      ><span>₹</span><strong>Payment Desk</strong></button
    >
    <nav aria-label="Primary navigation">
      {#each navigation as item}
        <button class:active={activeView === item.id} onclick={() => (activeView = item.id)}>
          <span>{item.label}</span>
        </button>
      {/each}
    </nav>
    <div class="top-status">
      <Circle size={8} fill="currentColor" /><span>Local</span><time
        >{new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit'
        }).format(now)}</time
      >
    </div>
  </header>

  <main class="workspace">
    {#if activeView === 'today'}<Dashboard />
    {:else if activeView === 'ledger'}<Ledger />
    {:else if activeView === 'review'}<ReviewInbox />
    {:else if activeView === 'masters'}<Masters />
    {:else if activeView === 'activity'}<ActivityLog />
    {:else if activeView === 'system'}<SystemDashboard />
    {:else}<Reports />{/if}
  </main>
</div>
