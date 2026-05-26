---
title: "Table (pre-bound) Example"
description: "Extracted example from ctx.resource"
---

# ctx.resource

## Table (pre-bound)

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
for (const row of rows) {
  console.log(row);
}

await ctx.resource.destroySelectedRows();
ctx.message.success(ctx.t('Deleted'));
```
