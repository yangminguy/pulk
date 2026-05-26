---
title: "When to use ctx.exit() vs ctx.exitAll() Example"
description: "Extracted example from ctx.exit()"
---

# ctx.exit()

## When to use ctx.exit() vs ctx.exitAll()

```ts
// Only this flow should stop → ctx.exit()
if (!params.valid) {
  ctx.message.error('Invalid params');
  ctx.exit();
}

// Stop this and all subsequent flows for this event → ctx.exitAll()
if (!ctx.model?.context?.getPermission?.()) {
  ctx.notification.warning({ message: 'No permission' });
  ctx.exitAll();
}
```
