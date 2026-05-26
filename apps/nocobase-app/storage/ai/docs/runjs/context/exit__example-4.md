---
title: "Exit when business condition fails Example"
description: "Extracted example from ctx.exit()"
---

# ctx.exit()

## Exit when business condition fails

```ts
const record = ctx.model?.getValue?.();
if (!record || record.status !== 'draft') {
  ctx.notification.warning({ message: 'Only draft can be submitted' });
  ctx.exit();
}
```
