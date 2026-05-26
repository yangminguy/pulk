---
title: "Resource-style URL Example"
description: "Extracted example from APIResource"
---

# APIResource

## Resource-style URL

```js
const res = ctx.makeResource('APIResource');
res.setURL('users:list');
res.setRequestParameters({ pageSize: 20, sort: ['-createdAt'] });
await res.refresh();
const rows = res.getData()?.data ?? [];
```
