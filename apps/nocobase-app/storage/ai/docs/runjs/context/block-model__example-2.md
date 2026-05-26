---
title: "Table: get selected rows and process Example"
description: "Extracted example from ctx.blockModel"
---

# ctx.blockModel

## Table: get selected rows and process

```ts
const rows = ctx.blockModel?.resource?.getSelectedRows?.() || [];
if (rows.length === 0) {
  ctx.message.warning('Please select data first');
  return;
}
```
