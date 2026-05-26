---
title: "List (after initResource) Example"
description: "Extracted example from ctx.resource"
---

# ctx.resource

## List (after initResource)

```js
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('users');
await ctx.resource.refresh();
const rows = ctx.resource.getData();
```
