---
title: "Basic list Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Basic list

```js
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('users');
ctx.resource.setPageSize(20);
await ctx.resource.refresh();
const rows = ctx.resource.getData();
const total = ctx.resource.getCount();
```
