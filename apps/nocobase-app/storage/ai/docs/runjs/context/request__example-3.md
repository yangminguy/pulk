---
title: "List Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## List

```javascript
const { data } = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: { pageSize: 10, page: 1 },
});

const rows = Array.isArray(data?.data) ? data.data : [];
const meta = data?.meta;
```
