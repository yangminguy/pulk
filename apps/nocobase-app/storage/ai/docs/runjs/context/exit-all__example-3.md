---
title: "Stop on global pre-check failure Example"
description: "Extracted example from ctx.exitAll()"
---

# ctx.exitAll()

## Stop on global pre-check failure

```ts
const canDelete = await checkDeletable(ctx.model?.getValue?.());
if (!canDelete) {
  ctx.message.error('Cannot delete: related data exists');
  ctx.exitAll();
}
```
