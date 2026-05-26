---
title: "Cross–data-source collection metadata Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Cross–data-source collection metadata

```ts
const users = ctx.dataSourceManager.getCollection('main', 'users');
const orders = ctx.dataSourceManager.getCollection('main', 'orders');

const primaryKey = users?.filterTargetKey ?? 'id';
```
