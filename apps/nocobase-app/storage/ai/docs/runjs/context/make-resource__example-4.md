---
title: "One-off query Example"
description: "Extracted example from ctx.makeResource()"
---

# ctx.makeResource()

## One-off query

```ts
const tempRes = ctx.makeResource('SingleRecordResource');
tempRes.setResourceName('users');
tempRes.setFilterByTk(1);
await tempRes.refresh();
const record = tempRes.getData();
```
