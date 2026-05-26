---
title: "Confirm and control flow Example"
description: "Extracted example from ctx.modal"
---

# ctx.modal

## Confirm and control flow

```ts
const confirmed = await ctx.modal.confirm({
  title: 'Confirm delete',
  content: 'Delete this record?',
  okText: 'OK',
  cancelText: 'Cancel',
});
if (!confirmed) {
  ctx.exit();
  return;
}
await ctx.runAction('destroy', { filterByTk: ctx.record?.id });
```
