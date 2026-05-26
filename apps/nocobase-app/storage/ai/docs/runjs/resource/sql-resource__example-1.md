---
title: "Run by saved template (runById) Example"
description: "Extracted example from SQLResource"
---

# SQLResource

## Run by saved template (runById)

```js
ctx.initResource('SQLResource');
ctx.resource.setFilterByTk('active-users-report'); // Saved SQL template uid
ctx.resource.setBind({ status: 'active' });
await ctx.resource.refresh();
const data = ctx.resource.getData();
const meta = ctx.resource.getMeta(); // page, pageSize, count, etc.
```
