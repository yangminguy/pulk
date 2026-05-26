---
title: "Exit on user cancel Example"
description: "Extracted example from ctx.exit()"
---

# ctx.exit()

## Exit on user cancel

```ts
if (!confirmed) {
  ctx.message.info('Cancelled');
  ctx.exit();
}
```
