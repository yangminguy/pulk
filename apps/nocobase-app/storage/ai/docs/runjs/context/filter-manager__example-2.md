---
title: "Add filter config Example"
description: "Extracted example from ctx.filterManager"
---

# ctx.filterManager

## Add filter config

```ts
await ctx.filterManager?.addFilterConfig({
  filterId: 'filter-form-item-uid',
  targetId: 'table-block-uid',
  filterPaths: ['status', 'createdAt'],
  operator: '$eq',
});
```
