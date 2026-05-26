---
title: "Get primary key and open popup Example"
description: "Extracted example from ctx.collection"
---

# ctx.collection

## Get primary key and open popup

```ts
const primaryKey = ctx.collection?.filterTargetKey ?? 'id';
await ctx.openView(popupUid, {
  mode: 'dialog',
  params: {
    filterByTk: ctx.record?.[primaryKey],
    record: ctx.record,
  },
});
```
