<script lang="ts">
  import { BarChart, PieChart } from 'layerchart';

  let {
    daily,
    categories
  }: {
    daily: Array<{ label: string; cashPaise?: number; nonCashPaise?: number }>;
    categories: Array<{ label: string; totalPaise: number }>;
  } = $props();
  const dailyChart = $derived.by(() => {
    const bucketSize = Math.max(1, Math.ceil(daily.length / 24));
    const buckets: Array<{ day: string; cash: number; nonCash: number }> = [];
    for (let index = 0; index < daily.length; index += bucketSize) {
      const rows = daily.slice(index, index + bucketSize);
      buckets.push({
        day: rows[0]?.label.slice(5) ?? '',
        cash: rows.reduce((sum, row) => sum + (row.cashPaise ?? 0), 0) / 100,
        nonCash: rows.reduce((sum, row) => sum + (row.nonCashPaise ?? 0), 0) / 100
      });
    }
    return buckets;
  });
  const categoryChart = $derived(
    categories.slice(0, 8).map((row) => ({ category: row.label, value: row.totalPaise / 100 }))
  );
  const chartColors = [
    '#16274d',
    '#6c97d6',
    '#2b5dab',
    '#a3bfe8',
    '#1e3d73',
    '#cbdbf3',
    '#3b72c4',
    '#e4edfb'
  ];
</script>

{#if daily.length}
  <div class="layerchart-frame" aria-label="Cash and non-cash spending by day">
    <BarChart
      data={dailyChart}
      x="day"
      series={[
        { key: 'cash', label: 'Cash', value: 'cash', color: '#a3bfe8' },
        { key: 'nonCash', label: 'Non-cash', value: 'nonCash', color: '#2b5dab' }
      ]}
      seriesLayout="stack"
      bandPadding={0.28}
      padding={{ left: 52, right: 12, top: 18, bottom: 32 }}
    />
  </div>
{:else}
  <div class="layerchart-frame donut-frame" aria-label="Spending share by category">
    <PieChart
      data={categoryChart}
      key="category"
      label="category"
      value="value"
      c="category"
      cRange={chartColors}
      innerRadius={0.58}
      cornerRadius={3}
      padAngle={0.018}
    />
    <div class="chart-legend">
      {#each categoryChart as row, index}<span
          ><i style={`background:${chartColors[index]}`}></i>{row.category}</span
        >{/each}
    </div>
  </div>
{/if}
