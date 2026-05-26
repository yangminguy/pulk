---
title: "Single resource Example"
description: "Extracted example from ctx.makeResource()"
---

# ctx.makeResource()

## Single resource

```ts
const listRes = ctx.makeResource('MultiRecordResource');
listRes.setResourceName('users');
await listRes.refresh();
const users = listRes.getData();
// ctx.resource unchanged (if it existed)
```
