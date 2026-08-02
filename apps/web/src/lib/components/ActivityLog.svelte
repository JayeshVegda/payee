<script lang="ts">
  import { onMount } from 'svelte';
  import { api, formatInr } from '$lib/api';
  interface Event {
    id: number;
    action: string;
    changedAt: string;
    source: string;
    transactionId: number;
    amountPaise: number;
    payeeName: string;
  }
  let events = $state<Event[]>([]);
  let error = $state('');
  onMount(async () => {
    try {
      events = await api<Event[]>('/activity?limit=150');
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Activity could not be loaded';
    }
  });
</script>

<div class="page-stack activity-page">
  <header class="page-header"><div><h1>Activity</h1></div></header>
  {#if error}<div class="notice error">{error}</div>{/if}
  <section class="panel activity-list">
    {#each events as event}<article>
        <span class={`activity-icon ${event.action}`}>{event.action.slice(0, 1).toUpperCase()}</span
        >
        <div>
          <strong>{event.payeeName} · {event.action}</strong><small
            >{new Date(event.changedAt).toLocaleString('en-IN', { hour12: true })} · {event.source} ·
            transaction #{event.transactionId}</small
          >
        </div>
        <b>{formatInr(event.amountPaise)}</b>
      </article>{:else}<p class="empty">No activity yet.</p>{/each}
  </section>
</div>
