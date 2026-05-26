---
title: "Basic GET request Example"
description: "Extracted example from APIResource"
---

# APIResource

## Basic GET request

```js
const res = ctx.makeResource('APIResource');
res.setURL('/api/custom/endpoint');
res.setRequestParameters({ page: 1, pageSize: 10 });
await res.refresh();
const data = res.getData();
```
