---
title: "Stop all flows on permission failure Example"
description: "Extracted example from ctx.exitAll()"
---

# ctx.exitAll()

## Stop all flows on permission failure

```ts
if (!hasPermission(ctx)) {
  ctx.notification.error({ message: 'No permission' });
  ctx.exitAll();
}
```
