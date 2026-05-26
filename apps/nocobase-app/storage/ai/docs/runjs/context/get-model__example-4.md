---
title: "Cross-model update and rerender Example"
description: "Extracted example from ctx.getModel()"
---

# ctx.getModel()

## Cross-model update and rerender

```ts
const target = ctx.getModel('other-block-uid');
if (target) {
  target.setProps({ loading: true });
  target.rerender?.();
}
```
