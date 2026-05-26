---
title: "Debug mode: run SQL directly (runBySQL) Example"
description: "Extracted example from SQLResource"
---

# SQLResource

## Debug mode: run SQL directly (runBySQL)

```js
const res = ctx.makeResource('SQLResource');
res.setDebug(true);
res.setSQL('SELECT * FROM users WHERE status = :status LIMIT {{ctx.limit}}');
res.setBind({ status: 'active' });
await res.refresh();
const data = res.getData();
```
