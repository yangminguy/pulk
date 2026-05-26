---
title: "Single record Example"
description: "Extracted example from ctx.resource"
---

# ctx.resource

## Single record

```js
ctx.initResource('SingleRecordResource');
ctx.resource.setResourceName('users');
ctx.resource.setFilterByTk(1);
await ctx.resource.refresh();
const record = ctx.resource.getData();
```
