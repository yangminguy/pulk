---
title: "Pass current row context Example"
description: "Extracted example from ctx.openView()"
---

# ctx.openView()

## Pass current row context

```ts
const primaryKey = ctx.collection?.primaryKey || 'id';
await ctx.openView(`${ctx.model.uid}-1`, {
  mode: 'dialog',
  title: ctx.t('Row detail'),
  params: {
    filterByTk: ctx.record?.[primaryKey],
    record: ctx.record,
  },
});
```
