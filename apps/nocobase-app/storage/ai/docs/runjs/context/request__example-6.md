---
title: "Skip error notify Example"
description: "Extracted example from ctx.request()"
---

# ctx.request()

## Skip error notify

```javascript
const res = await ctx.request({
  url: 'some:action',
  method: 'get',
  skipNotify: true,
});

const res2 = await ctx.request({
  url: 'some:action',
  method: 'get',
  skipNotify: (err) => err?.name === 'CanceledError',
});
```
