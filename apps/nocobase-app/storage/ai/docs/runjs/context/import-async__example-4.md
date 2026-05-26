---
title: "Tabulator Example"
description: "Extracted example from ctx.importAsync()"
---

# ctx.importAsync()

## Tabulator

```ts
await ctx.importAsync('tabulator-tables@6.2.5/dist/css/tabulator.min.css');

const { TabulatorFull } = await ctx.importAsync('tabulator-tables@6.2.5');

const tableEl = document.createElement('div');
ctx.render(tableEl);

const table = new TabulatorFull(tableEl, {
  data: [
    { id: 1, name: 'Alice', age: 25, city: 'Beijing' },
    { id: 2, name: 'Bob', age: 30, city: 'Shanghai' },
    { id: 3, name: 'Charlie', age: 28, city: 'Guangzhou' },
  ],
  columns: [
    { title: 'ID', field: 'id', width: 80 },
    { title: 'Name', field: 'name', width: 150 },
    { title: 'Age', field: 'age', width: 100 },
    { title: 'City', field: 'city', width: 150 },
  ],
  layout: 'fitColumns',
  pagination: true,
  paginationSize: 10,
});

table.on('rowClick', (e, row) => {
  const rowData = row.getData();
  ctx.message.info(`Row clicked: ${rowData.name}`);
});
```
