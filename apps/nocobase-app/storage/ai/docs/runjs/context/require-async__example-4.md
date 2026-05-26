---
title: "Chart.js bar Example"
description: "Extracted example from ctx.requireAsync()"
---

# ctx.requireAsync()

## Chart.js bar

```javascript
async function renderChart() {
  const loaded = await ctx.requireAsync('chart.js@4.4.0/dist/chart.umd.min.js');
  const Chart = loaded?.Chart || loaded?.default?.Chart || loaded?.default;
  if (!Chart) throw new Error('Chart.js not loaded');

  const container = document.createElement('canvas');
  ctx.render(container);

  new Chart(container, {
    type: 'bar',
    data: {
      labels: ['A', 'B', 'C'],
      datasets: [{ label: ctx.t('Count'), data: [12, 19, 3] }],
    },
  });
}
await renderChart();
```
