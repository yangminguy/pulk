---
title: "Iterate all data sources Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Iterate all data sources

```ts
const dataSources = ctx.dataSourceManager.getDataSources();
for (const ds of dataSources) {
  ctx.logger.info(`Data source: ${ds.key}, display: ${ds.displayName}`);
  const collections = ds.getCollections();
  for (const col of collections) {
    ctx.logger.info(`  - Collection: ${col.name}`);
  }
}
```
