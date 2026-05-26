---
title: "Basic get and update Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Basic get and update

```js
ctx.initResource('SingleRecordResource');
ctx.resource.setResourceName('users');
ctx.resource.setFilterByTk(1);
await ctx.resource.refresh();
const user = ctx.resource.getData();

// Update
await ctx.resource.save({ name: 'Jane' });
```
