---
title: "Specify data source Example"
description: "Extracted example from ctx.initResource()"
---

# ctx.initResource()

## Specify data source

```ts
ctx.initResource('MultiRecordResource');
ctx.resource.setDataSourceKey('main');
ctx.resource.setResourceName('orders');
await ctx.resource.refresh();
```
