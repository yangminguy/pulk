---
title: "Association expansion Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Association expansion

```js
ctx.resource.setResourceName('orders');
ctx.resource.setAppends(['user', 'items']);
await ctx.resource.refresh();
const orders = ctx.resource.getData();
```
