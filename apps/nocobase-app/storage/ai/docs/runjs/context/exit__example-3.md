---
title: "Exit on validation failure Example"
description: "Extracted example from ctx.exit()"
---

# ctx.exit()

## Exit on validation failure

```ts
if (!params.value || params.value.length < 3) {
  ctx.message.error('Invalid: length must be at least 3');
  ctx.exit();
}
```
