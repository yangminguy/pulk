---
title: "Set default by condition Example"
description: "Extracted example from ctx.setValue()"
---

# ctx.setValue()

## Set default by condition

```ts
const status = ctx.getValue();
if (status == null || status === '') {
  ctx.setValue?.('draft');
}
```
