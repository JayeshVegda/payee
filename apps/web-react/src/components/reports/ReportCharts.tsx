import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatInr } from '../../api/client';

// Register tree-shakable ECharts modules
echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ReportChartsProps {
  daily: Array<{ label: string; cashPaise?: number; nonCashPaise?: number }>;
  categories: Array<{ label: string; totalPaise: number }>;
}

export default function ReportCharts({ daily, categories }: ReportChartsProps) {
  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  // Daily Trend Bar Chart (Cash vs Digital)
  useEffect(() => {
    if (!barChartRef.current || daily.length < 2) return;

    // Bucket daily data if there are too many items (e.g. more than 30)
    const bucketSize = Math.max(1, Math.ceil(daily.length / 24));
    const days: string[] = [];
    const cashData: number[] = [];
    const digitalData: number[] = [];

    for (let i = 0; i < daily.length; i += bucketSize) {
      const slice = daily.slice(i, i + bucketSize);
      days.push(slice[0]?.label.slice(5) || ''); // MM-DD format
      cashData.push(slice.reduce((sum, row) => sum + (row.cashPaise ?? 0), 0) / 100);
      digitalData.push(slice.reduce((sum, row) => sum + (row.nonCashPaise ?? 0), 0) / 100);
    }

    const chartInstance = echarts.init(barChartRef.current);
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          let output = `<div className="font-sans text-xs font-semibold p-1">${params[0].name}</div>`;
          params.forEach((p: any) => {
            output += `
              <div className="flex items-center gap-4 text-xs font-medium mt-1">
                <span className="flex items-center gap-1.5">
                  <span style="background-color:${p.color}" className="w-2.5 h-2.5 rounded-full inline-block"></span>
                  ${p.seriesName}
                </span>
                <strong className="font-mono ml-auto">${formatInr(p.value * 100)}</strong>
              </div>
            `;
          });
          return output;
        }
      },
      legend: {
        data: ['Cash', 'Digital'],
        textStyle: { fontFamily: 'Geist Sans', fontSize: 11, color: '#66738d' },
        right: '4%'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: days,
        axisLine: { lineStyle: { color: '#dce3ee' } },
        axisLabel: { fontFamily: 'Geist Mono', fontSize: 10, color: '#66738d' }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#dce3ee' } },
        splitLine: { lineStyle: { color: '#f5f7fa' } },
        axisLabel: {
          fontFamily: 'Geist Mono',
          fontSize: 10,
          color: '#66738d',
          formatter: (val: number) => `₹${val}`
        }
      },
      series: [
        {
          name: 'Cash',
          type: 'bar',
          stack: 'total',
          data: cashData,
          itemStyle: { color: '#a3bfe8' },
          barWidth: '55%'
        },
        {
          name: 'Digital',
          type: 'bar',
          stack: 'total',
          data: digitalData,
          itemStyle: { color: '#2b5dab' },
          barWidth: '55%'
        }
      ]
    };

    chartInstance.setOption(option);

    const handleResize = () => chartInstance.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.dispose();
    };
  }, [daily]);

  // Category Pie Donut Chart
  useEffect(() => {
    if (!pieChartRef.current || categories.length === 0) return;

    const data = categories.slice(0, 8).map((cat) => ({
      name: cat.label,
      value: cat.totalPaise / 100
    }));

    const chartInstance = echarts.init(pieChartRef.current);
    const option = {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `
          <div className="font-sans text-xs p-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <span style="background-color:${p.color}" className="w-2.5 h-2.5 rounded-full inline-block"></span>
              ${p.name}
            </span>
            <div className="flex justify-between items-baseline gap-4 mt-1.5 font-medium text-ledger-muted">
              <span>Spent</span>
              <strong className="font-mono text-ledger-ink ml-auto">${formatInr(p.value * 100)}</strong>
            </div>
            <div className="text-[10px] text-ledger-muted mt-0.5">Share: ${p.percent}%</div>
          </div>
        `
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        textStyle: { fontFamily: 'Geist Sans', fontSize: 11, color: '#66738d' }
      },
      series: [
        {
          name: 'Category Spent',
          type: 'pie',
          radius: ['50%', '75%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
              fontFamily: 'Geist Sans'
            }
          },
          labelLine: { show: false },
          data,
          color: ['#16274d', '#6c97d6', '#2b5dab', '#a3bfe8', '#1e3d73', '#cbdbf3', '#3b72c4', '#e4edfb']
        }
      ]
    };

    chartInstance.setOption(option);

    const handleResize = () => chartInstance.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.dispose();
    };
  }, [categories]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
      {/* Daily trend */}
      <div className="ledger-card border-ledger-border bg-white flex flex-col justify-between p-4 min-h-[300px]">
        <div>
          <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
            Daily Trend (Cash vs Digital)
          </h3>
          <p className="text-[10px] text-ledger-muted">Stacked daily flow details</p>
        </div>
        {daily.length >= 2 ? (
          <div ref={barChartRef} className="w-full h-[220px]" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-ledger-muted italic">
            Trend chart requires at least two daily active data buckets.
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="ledger-card border-ledger-border bg-white flex flex-col justify-between p-4 min-h-[300px]">
        <div>
          <h3 className="text-xs font-bold text-ledger-ink uppercase tracking-wider">
            Category Breakdown
          </h3>
          <p className="text-[10px] text-ledger-muted font-medium">Spending distribution shares</p>
        </div>
        {categories.length > 0 ? (
          <div ref={pieChartRef} className="w-full h-[220px]" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-ledger-muted italic">
            No categories distribution data available.
          </div>
        )}
      </div>
    </div>
  );
}
