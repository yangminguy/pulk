---
title: "Create Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## Create

```javascript
const res = await ctx.request({
  url: 'users:create',
  method: 'post',
  data: { nickname: 'John', email: 'john@example.com' },
});

const newRecord = res?.data?.data;
```
