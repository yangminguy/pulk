---
title: "Filter and sort Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## Filter and sort

```javascript
const res = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: {
    pageSize: 20,
    sort: ['-createdAt'],
    filter: { status: 'active' },
  },
});
```
