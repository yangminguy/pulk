---
title: "Dynamic data source from variable Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Dynamic data source from variable

```ts
const dsKey = ctx.getVar('dataSourceKey') ?? 'main';
const collectionName = ctx.getVar('collectionName') ?? 'users';
const col = ctx.dataSourceManager.getCollection(dsKey, collectionName);
if (col) {
  const fields = col.getFields();
  // ...
}
```
