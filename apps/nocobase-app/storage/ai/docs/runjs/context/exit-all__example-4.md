---
title: "When to use ctx.exit() vs ctx.exitAll() Example"
description: "Extracted example from ctx.exitAll()"
---

# ctx.exitAll()

## When to use ctx.exit() vs ctx.exitAll()

```ts
// Only this flow → ctx.exit()
if (!params.valid) {
  ctx.message.error('Invalid params');
  ctx.exit();
}

// This and all subsequent flows → ctx.exitAll()
if (!ctx.model?.context?.getPermission?.()) {
  ctx.notification.warning({ message: 'No permission' });
  ctx.exitAll();
}
```
