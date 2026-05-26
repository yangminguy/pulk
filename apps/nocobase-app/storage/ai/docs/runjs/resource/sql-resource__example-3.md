---
title: "Pagination and navigation Example"
description: "Extracted example from SQLResource"
---

# SQLResource

## Pagination and navigation

```js
ctx.resource.setFilterByTk('user-list-sql');
ctx.resource.setPageSize(20);
await ctx.resource.refresh();

// Navigate pages
await ctx.resource.next();
await ctx.resource.previous();
await ctx.resource.goto(3);
```
