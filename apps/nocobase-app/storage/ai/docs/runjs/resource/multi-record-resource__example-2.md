---
title: "Filter and sort Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Filter and sort

```js
ctx.resource.setResourceName('users');
ctx.resource.setFilter({ status: 'active' });
ctx.resource.setSort(['-createdAt']);
ctx.resource.setFields(['id', 'nickname', 'email']);
await ctx.resource.refresh();
```
