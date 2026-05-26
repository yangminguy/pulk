---
title: "Error Example"
description: "Extracted example from ctx.modal"
---

# ctx.modal

## Error

```ts
try {
  await someOperation();
  ctx.modal.success({ title: 'Success', content: 'Done' });
} catch (e) {
  ctx.modal.error({ title: 'Error', content: e.message });
}
```
