---
title: "Null check Example"
description: "Extracted example from ctx.getModel()"
---

# ctx.getModel()

## Null check

```ts
const model = ctx.getModel(someUid);
if (!model) {
  ctx.message.warning('Target model not found');
  return;
}
```
