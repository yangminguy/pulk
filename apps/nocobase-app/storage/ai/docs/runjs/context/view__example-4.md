---
title: "Branch by view type or inputArgs Example"
description: "Extracted example from ctx.view"
---

# ctx.view

## Branch by view type or inputArgs

```ts
if (ctx.view?.type === 'embed') {
  ctx.model.setProps('headerStyle', { display: 'none' });
}

const collectionName = ctx.view?.inputArgs?.collectionName;
if (collectionName === 'users') {
  // User selector
}
```
