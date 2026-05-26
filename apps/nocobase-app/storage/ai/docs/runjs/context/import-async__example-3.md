---
title: "ECharts Example"
description: "Extracted example from ctx.importAsync()"
---

# ctx.importAsync()

## ECharts

```ts
const echarts = await ctx.importAsync('echarts@5.4.3');

const chartEl = document.createElement('div');
chartEl.style.width = '100%';
chartEl.style.height = '400px';
ctx.render(chartEl);

const chart = echarts.init(chartEl);

const option = {
  title: { text: 'Sales Overview', left: 'center' },
  tooltip: { trigger: 'axis' },
  legend: { data: ['Sales', 'Profit'], top: '10%' },
  xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
  yAxis: { type: 'value' },
  series: [
    { name: 'Sales', type: 'bar', data: [120, 200, 150, 80, 70, 110] },
    { name: 'Profit', type: 'line', data: [20, 40, 30, 15, 12, 25] },
  ],
};

chart.setOption(option);

window.addEventListener('resize', () => chart.resize());

chart.on('click', (params) => {
  ctx.message.info(`Clicked ${params.seriesName} on ${params.name}, value: ${params.value}`);
});
```
