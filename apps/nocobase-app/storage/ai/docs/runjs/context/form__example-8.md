---
title: "Same row in sub-table Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Same row in sub-table

```ts
// ctx.namePath is current field path, e.g. ['orders', 0, 'amount']
// Same row status: ['orders', 0, 'status']
const rowIndex = ctx.namePath?.[1];
const status = ctx.form.getFieldValue(['orders', rowIndex, 'status']);
```
