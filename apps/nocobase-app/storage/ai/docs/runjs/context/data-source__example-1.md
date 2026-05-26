---
title: "Type Example"
description: "Extracted example from ctx.dataSource"
---

# ctx.dataSource

## Type

```ts
dataSource: DataSource;

class DataSource {
  constructor(options?: Record<string, any>);

  get flowEngine(): FlowEngine;
  get displayName(): string;
  get key(): string;
  get name(): string;

  getCollections(): Collection[];
  getCollection(name: string): Collection | undefined;
  getAssociation(associationName: string): CollectionField | undefined;

  addCollection(collection: Collection | CollectionOptions): void;
  updateCollection(newOptions: CollectionOptions): void;
  upsertCollection(options: CollectionOptions): Collection | undefined;
  upsertCollections(collections: CollectionOptions[], options?: { clearFields?: boolean }): void;
  removeCollection(name: string): void;
  clearCollections(): void;

  getCollectionField(fieldPath: string): CollectionField | undefined;
}
```
