---
title: "Exit after modal confirm Example"
description: "Extracted example from ctx.exit()"
---

# ctx.exit()

## Exit after modal confirm

```ts
const ok = await ctx.modal?.confirm?.({
  title: 'Confirm delete',
  content: 'Cannot be recovered. Continue?',
});
if (!ok) {
  ctx.message.info('Cancelled');
  ctx.exit();
}
```
