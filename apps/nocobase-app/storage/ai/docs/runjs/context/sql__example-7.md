---
title: "Paginated list (SQLResource) Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Paginated list (SQLResource)

```js
// For pagination and filters, use SQLResource
ctx.initResource('SQLResource');
ctx.resource.setFilterByTk('saved-sql-uid');  // Saved SQL template ID
ctx.resource.setBind({ status: 'active' });
await ctx.resource.refresh();
const data = ctx.resource.getData();
const meta = ctx.resource.getMeta();  // page, pageSize, etc.
```
