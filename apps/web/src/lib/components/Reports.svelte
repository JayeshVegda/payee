<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteDate } from 'svelte/reactivity';
  import { api, formatInr, post, queryString } from '$lib/api';
  import TransactionDetailDrawer from './TransactionDetailDrawer.svelte';

  interface GroupRow {
    label: string;
    totalPaise: number;
    paymentCount: number;
    averageTransactionPaise?: number;
    averageActiveDayPaise?: number;
    activeDays?: number;
    code?: string | null;
    cashPaise?: number;
    nonCashPaise?: number;
  }
  interface ReportTransaction {
    id: number;
    transactionDate: string;
    payeeName: string;
    amountPaise: number;
    note?: string | null;
    averagePaise?: number;
  }
  interface ReportsData {
    from: string;
    to: string;
    totals: {
      totalPaise: number;
      paymentCount: number;
      payeeCount: number;
      activeDayCount: number;
      averageTransactionPaise: number;
    };
    daily: GroupRow[];
    categories: GroupRow[];
    methods: GroupRow[];
    payees: Array<GroupRow & { id: number; type: string }>;
    largest: ReportTransaction[];
    repeated: Array<{ payeeName: string; amountPaise: number; occurrences: number }>;
    unusual: ReportTransaction[];
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let from = $state(`${today.slice(0, 8)}01`);
  let to = $state(today);
  let data = $state<ReportsData | null>(null);
  let error = $state('');
  let backupMessage = $state('');
  let loading = $state(false);
  let selectedId = $state<number | null>(null);
  const reportCharts = import('./ReportCharts.svelte');
  const averageActiveDay = $derived(
    data?.totals.activeDayCount
      ? Math.round(data.totals.totalPaise / data.totals.activeDayCount)
      : 0
  );
  const cashTotal = $derived(data?.methods.find((row) => row.code === 'cash')?.totalPaise ?? 0);
  const cashShare = $derived(
    data?.totals.totalPaise ? Math.round((cashTotal / data.totals.totalPaise) * 100) : 0
  );
  const topCategory = $derived(data?.categories[0] ?? null);
  const categoryColors = ['#16274d', '#6c97d6', '#2b5dab', '#a3bfe8', '#1e3d73', '#cbdbf3'];

  function setRange(days: number | 'month' | 'six-months'): void {
    const end = new SvelteDate(`${today}T00:00:00`);
    if (days === 'month') from = `${today.slice(0, 8)}01`;
    else {
      const start = new SvelteDate(end);
      if (days === 'six-months') start.setMonth(start.getMonth() - 6);
      else start.setDate(start.getDate() - days + 1);
      from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(start);
    }
    to = today;
    void load();
  }
  async function load(): Promise<void> {
    loading = true;
    try {
      data = await api<ReportsData>(`/reports${queryString({ from, to })}`);
      error = '';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Reports could not be loaded';
    } finally {
      loading = false;
    }
  }
  async function backup(): Promise<void> {
    try {
      const result = await post<{ filename: string; integrity: string }>('/system/backup', {});
      backupMessage = `${result.filename} created and verified.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Backup could not be created';
    }
  }
  onMount(() => {
    void load();
  });
</script>

<div class="page-stack reports-page">
  <header class="page-header">
    <div>
      <h1>Reports</h1>
    </div>
    <div class="header-actions">
      <a class="button secondary" href={`/api/export/transactions.csv${queryString({ from, to })}`}
        >Export CSV</a
      ><button class="button secondary" onclick={() => window.print()}>Print</button>
    </div>
  </header>
  <section class="report-controls">
    <div class="range-presets">
      <button onclick={() => setRange(7)}>7 days</button><button onclick={() => setRange(30)}
        >30 days</button
      ><button onclick={() => setRange('month')}>This month</button><button
        onclick={() => setRange('six-months')}>6 months</button
      >
    </div>
    <div class="date-range">
      <label>From<input type="date" bind:value={from} /></label><span>→</span><label
        >To<input type="date" bind:value={to} /></label
      ><button class="button primary" onclick={() => void load()} disabled={loading}
        >{loading ? 'Loading…' : 'Apply'}</button
      >
    </div>
  </section>
  {#if error}<div class="notice error">{error}</div>{/if}

  <section class="report-hero">
    <article>
      <span>Total outgoing</span><strong>{formatInr(data?.totals.totalPaise ?? 0)}</strong><small
        >{from} – {to}</small
      >
    </article>
    <article>
      <span>Average active day</span><strong>{formatInr(averageActiveDay)}</strong><small
        >{data?.totals.activeDayCount ?? 0} days with payments</small
      >
    </article>
    <article>
      <span>Average payment</span><strong
        >{formatInr(data?.totals.averageTransactionPaise ?? 0)}</strong
      ><small>{data?.totals.paymentCount ?? 0} transactions</small>
    </article>
    <article class="cash-report-card">
      <span>Paid in cash</span><strong>{formatInr(cashTotal)}</strong><small
        >{cashShare}% of total spending</small
      >
    </article>
  </section>

  <section class="insight-strip">
    <div>
      <span>Largest category</span><strong>{topCategory?.label ?? 'No data'}</strong><small
        >{topCategory ? formatInr(topCategory.totalPaise) : '—'}</small
      >
    </div>
    <div>
      <span>People and companies paid</span><strong>{data?.totals.payeeCount ?? 0}</strong><small
        >Unique payees in range</small
      >
    </div>
    <div>
      <span>Highest single payment</span><strong
        >{formatInr(data?.largest[0]?.amountPaise ?? 0)}</strong
      ><small>{data?.largest[0]?.payeeName ?? 'No payments'}</small>
    </div>
  </section>

  <section class="analytics-grid">
    <article class="panel trend-panel">
      <div class="panel-heading">
        <div>
          <h2>Spending rhythm</h2>
          <p>Cash versus all other payment methods</p>
        </div>
      </div>
      <div class="report-chart trend-chart">
        {#if data?.daily.length && data.daily.length >= 2}
          {#await reportCharts}<div class="chart-loading">
              Loading chart…
            </div>{:then module}<module.default daily={data.daily} categories={[]} />{/await}
        {:else if data?.daily.length === 1}
          {@const period = data.daily[0]}
          {@const periodTotal = (period.cashPaise ?? 0) + (period.nonCashPaise ?? 0)}
          <div class="single-period-chart">
            <p>
              <strong>One active day</strong><span
                >A trend needs at least two days with payments.</span
              >
            </p>
            <div class="single-period-values">
              <span><i class="cash-swatch"></i>Cash <b>{formatInr(period.cashPaise ?? 0)}</b></span>
              <span
                ><i class="digital-swatch"></i>Digital
                <b>{formatInr(period.nonCashPaise ?? 0)}</b></span
              >
            </div>
            <div class="single-stack" aria-label="Cash and digital share for the only active day">
              <i
                class="cash-segment"
                style={`width:${periodTotal ? ((period.cashPaise ?? 0) / periodTotal) * 100 : 0}%`}
              ></i>
              <i
                class="digital-segment"
                style={`width:${periodTotal ? ((period.nonCashPaise ?? 0) / periodTotal) * 100 : 0}%`}
              ></i>
            </div>
            <small>{period.label} · {formatInr(periodTotal)} total</small>
          </div>
        {:else}
          <div class="chart-empty">
            <strong>No spending in this range</strong><span
              >Choose a wider date range to see a trend.</span
            >
          </div>
        {/if}
      </div>
    </article>
    <article class="panel category-chart-panel">
      <div class="panel-heading">
        <div>
          <h2>Category share</h2>
          <p>Where the money went</p>
        </div>
      </div>
      <div class="report-chart category-chart">
        {#if data}{#await reportCharts}<div class="chart-loading">
              Loading chart…
            </div>{:then module}<module.default
              daily={[]}
              categories={data.categories}
            />{/await}{/if}
      </div>
    </article>
  </section>

  <section class="panel category-analysis">
    <div class="panel-heading">
      <div>
        <h2>Category performance</h2>
        <p>Total, payment average, and average on days when that category was used</p>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Category</th><th class="amount">Total</th><th class="amount">Payments</th><th
              class="amount">Avg payment</th
            ><th class="amount">Avg active day</th><th class="amount">Share</th></tr
          ></thead
        ><tbody
          >{#each data?.categories ?? [] as row, index}<tr
              ><td
                ><strong>{row.label}</strong><span class="category-bar"
                  ><i
                    style={`width:${data?.totals.totalPaise ? Math.max(2, (row.totalPaise / data.totals.totalPaise) * 100) : 0}%;background:${categoryColors[index % categoryColors.length]}`}
                  ></i></span
                ></td
              ><td class="amount">{formatInr(row.totalPaise)}</td><td class="amount"
                >{row.paymentCount}</td
              ><td class="amount">{formatInr(row.averageTransactionPaise ?? 0)}</td><td
                class="amount">{formatInr(row.averageActiveDayPaise ?? 0)}</td
              ><td class="amount"
                >{data?.totals.totalPaise
                  ? ((row.totalPaise / data.totals.totalPaise) * 100).toFixed(1)
                  : 0}%</td
              ></tr
            >{:else}<tr><td colspan="6" class="empty">No category data in this period.</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </section>

  <section class="report-lists">
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>Payment methods</h2>
          <p>Volume and average payment</p>
        </div>
      </div>
      <div class="rank-list">
        {#each data?.methods ?? [] as row}<article>
            <div>
              <strong>{row.label}</strong><small
                >{row.paymentCount} payments · avg {formatInr(
                  row.averageTransactionPaise ?? 0
                )}</small
              >
            </div>
            <span>{formatInr(row.totalPaise)}</span>
          </article>{:else}<p class="empty">No data.</p>{/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>Top payees</h2>
          <p>Highest outgoing in this period</p>
        </div>
      </div>
      <div class="rank-list">
        {#each (data?.payees ?? []).slice(0, 8) as row}<article>
            <div>
              <strong>{row.label}</strong><small>{row.paymentCount} payments · {row.type}</small>
            </div>
            <span>{formatInr(row.totalPaise)}</span>
          </article>{:else}<p class="empty">No data.</p>{/each}
      </div>
    </article>
  </section>

  <section class="report-lists three">
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>Largest payments</h2>
          <p>Click to inspect the note and history</p>
        </div>
      </div>
      <div class="compact-list actionable-list">
        {#each (data?.largest ?? []).slice(0, 10) as row}<button
            onclick={() => (selectedId = row.id)}
            ><span
              ><strong>{row.payeeName}</strong><small
                >{row.transactionDate} · {row.note ?? 'No note'}</small
              ></span
            ><b>{formatInr(row.amountPaise)}</b></button
          >{:else}<p class="empty">No payments.</p>{/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>Repeated amounts</h2>
          <p>Same payee and value</p>
        </div>
      </div>
      <div class="compact-list">
        {#each (data?.repeated ?? []).slice(0, 10) as row}<article>
            <span><strong>{row.payeeName}</strong><small>{row.occurrences} occurrences</small></span
            ><b>{formatInr(row.amountPaise)}</b>
          </article>{:else}<p class="empty">No repeated patterns.</p>{/each}
      </div>
    </article>
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>Unusually high</h2>
          <p>At least twice that payee’s average</p>
        </div>
      </div>
      <div class="compact-list actionable-list">
        {#each (data?.unusual ?? []).slice(0, 10) as row}<button
            onclick={() => (selectedId = row.id)}
            ><span
              ><strong>{row.payeeName}</strong><small
                >{row.transactionDate} · usual avg {formatInr(row.averagePaise ?? 0)}</small
              ></span
            ><b>{formatInr(row.amountPaise)}</b></button
          >{:else}<p class="empty">No unusual payments.</p>{/each}
      </div>
    </article>
  </section>

  <section class="panel backup-panel">
    <div>
      <p class="eyebrow">Reliability</p>
      <h2>Verified manual backup</h2>
      <p>Create an online SQLite backup without stopping the local app.</p>
      {#if backupMessage}<strong class="success-text">{backupMessage}</strong>{/if}
    </div>
    <button class="button primary" onclick={() => void backup()}>Create verified backup</button>
  </section>
</div>
{#if selectedId}<TransactionDetailDrawer
    transactionId={selectedId}
    onclose={() => (selectedId = null)}
  />{/if}
