---
title: "Association resource (child table) Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Association resource (child table)

```js
const res = ctx.makeResource('MultiRecordResource');
res.setResourceName('users.roles');
res.setSourceId(ctx.record?.id);
await res.refresh();
const roles = res.getData();
```
