---
title: "Connection field config Example"
description: "Extracted example from ctx.filterManager"
---

# ctx.filterManager

## Connection field config

```ts
const config = ctx.filterManager?.getConnectFieldsConfig(ctx.model.uid);

await ctx.filterManager?.saveConnectFieldsConfig(ctx.model.uid, {
  targets: [
    { targetId: 'table-uid', filterPaths: ['status'] },
    { targetId: 'chart-uid', filterPaths: ['category'] },
  ],
});
```
