---
title: "Access page model from inside popup Example"
description: "Extracted example from ctx.getModel()"
---

# ctx.getModel()

## Access page model from inside popup

```ts
const pageBlock = ctx.getModel('page-block-uid', true);
if (pageBlock) {
  pageBlock.rerender?.();
}
```
