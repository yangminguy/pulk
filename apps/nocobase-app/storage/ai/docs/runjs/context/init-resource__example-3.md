---
title: "Single record (SingleRecordResource) Example"
description: "Extracted example from ctx.initResource()"
---

# ctx.initResource()

## Single record (SingleRecordResource)

```ts
ctx.initResource('SingleRecordResource');
ctx.resource.setResourceName('users');
ctx.resource.setFilterByTk(1);
await ctx.resource.refresh();
const record = ctx.resource.getData();
```
