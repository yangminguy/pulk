---
title: "Batch delete selected rows Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Batch delete selected rows

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
if (rows.length === 0) {
  ctx.message.warning('Please select data first');
  return;
}
await ctx.resource.destroySelectedRows();
ctx.message.success(ctx.t('Deleted'));
```
