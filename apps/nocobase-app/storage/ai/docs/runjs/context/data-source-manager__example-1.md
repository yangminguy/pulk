---
title: "Type Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Type

```ts
dataSourceManager: DataSourceManager;

class DataSourceManager {
  constructor();

  addDataSource(ds: DataSource | DataSourceOptions): void;
  upsertDataSource(ds: DataSource | DataSourceOptions): void;
  removeDataSource(key: string): void;
  clearDataSources(): void;

  getDataSources(): DataSource[];
  getDataSource(key: string): DataSource | undefined;

  getCollection(dataSourceKey: string, collectionName: string): Collection | undefined;
  getCollectionField(fieldPathWithDataSource: string): CollectionField | undefined;
}
```
