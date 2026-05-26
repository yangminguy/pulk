---
title: "Update UI after resource refresh Example"
description: "Extracted example from ctx.on()"
---

# ctx.on()

## Update UI after resource refresh

```ts
ctx.resource?.on('refresh', () => {
  const data = ctx.resource?.getData?.();
  // Update render from data
});
```
