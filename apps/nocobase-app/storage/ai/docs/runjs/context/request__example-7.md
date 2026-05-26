---
title: "Cross-origin Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## Cross-origin

```javascript
const res = await ctx.request({
  url: 'https://api.example.com/v1/data',
  method: 'get',
});

const res2 = await ctx.request({
  url: 'https://api.other.com/items',
  method: 'get',
  headers: {
    Authorization: 'Bearer <target-token>',
  },
});
```
