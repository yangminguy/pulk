---
title: "Confirm with onOk Example"
description: "Extracted example from ctx.modal"
---

# ctx.modal

## Confirm with onOk

```ts
await ctx.modal.confirm({
  title: 'Confirm submit',
  content: 'Cannot be changed after submit. Continue?',
  async onOk() {
    await ctx.form.submit();
  },
});
```
