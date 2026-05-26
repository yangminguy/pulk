---
title: "Iterate collections Example"
description: "Extracted example from ctx.dataSource"
---

# ctx.dataSource

## Iterate collections

```ts
const collections = ctx.dataSource.getCollections();
for (const col of collections) {
  const fields = col.getFields();
  const requiredFields = fields.filter((f) => f.options?.required);
  // ...
}
```
