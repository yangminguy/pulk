---
title: "Get a data source Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Get a data source

```ts
const mainDS = ctx.dataSourceManager.getDataSource('main');
const collections = mainDS?.getCollections();
```
