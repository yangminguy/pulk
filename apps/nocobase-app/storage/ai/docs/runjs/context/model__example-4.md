---
title: "Use uid for popup or cross-model Example"
description: "Extracted example from ctx.model"
---

# ctx.model

## Use uid for popup or cross-model

```ts
const myUid = ctx.model.uid;
const other = ctx.getModel('other-block-uid');
if (other) other.rerender?.();
```
