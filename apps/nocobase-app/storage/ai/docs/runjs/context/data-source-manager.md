---
title: "ctx.dataSourceManager"
description: "The data source manager (`DataSourceManager` instance) for managing and accessing multiple data sources (e.g. main `main`, logging `logging`). Use when you have multiple data sources or need cross–data-source metadata access."
---

# ctx.dataSourceManager

The data source manager (`DataSourceManager` instance) for managing and accessing multiple data sources (e.g. main `main`, logging `logging`). Use when you have multiple data sources or need cross–data-source metadata access.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Multiple data sources** | Enumerate all data sources, get one by key |
| **Cross–data-source access** | When context doesn’t know the data source, access by “data source key + collection name” |
| **Field by full path** | Get field definition with path format `dataSourceKey.collectionName.fieldPath` |

> Note: If you only work with the current data source, use `ctx.dataSource`; use `ctx.dataSourceManager` when you need to enumerate or switch data sources.

## Relation to ctx.dataSource

| Need | Recommended |
|------|-------------|
| **Single data source for context** | `ctx.dataSource` |
| **Entry to all data sources** | `ctx.dataSourceManager` |
| **List or switch data sources** | `ctx.dataSourceManager.getDataSources()` / `getDataSource(key)` |
| **Collection in current data source** | `ctx.dataSource.getCollection(name)` |
| **Collection in another data source** | `ctx.dataSourceManager.getCollection(dataSourceKey, collectionName)` |
| **Field in current data source** | `ctx.dataSource.getCollectionField('users.profile.avatar')` |
| **Field across data sources** | `ctx.dataSourceManager.getCollectionField('main.users.profile.avatar')` |

## Examples

## Notes

- `getCollectionField` path format is `dataSourceKey.collectionName.fieldPath`; first segment is data source key, then collection name and field path.
- `getDataSource(key)` returns `undefined` if the data source doesn’t exist—check before use.
- `addDataSource` throws if key already exists; `upsertDataSource` overwrites or adds.

## Related

- [ctx.dataSource](/runjs/context/data-source.md): current data source instance
- [ctx.collection](/runjs/context/collection.md): collection for current context
- [ctx.collectionField](/runjs/context/collection-field.md): current field’s collection field definition

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/data-source-manager__example-1.md`) - Extracted example from ctx.dataSourceManager
- **Get a data source Example** (`runjs/context/data-source-manager__example-2.md`) - Extracted example from ctx.dataSourceManager
- **Cross–data-source collection metadata Example** (`runjs/context/data-source-manager__example-3.md`) - Extracted example from ctx.dataSourceManager
- **Field by full path Example** (`runjs/context/data-source-manager__example-4.md`) - Extracted example from ctx.dataSourceManager
- **Iterate all data sources Example** (`runjs/context/data-source-manager__example-5.md`) - Extracted example from ctx.dataSourceManager
- **Dynamic data source from variable Example** (`runjs/context/data-source-manager__example-6.md`) - Extracted example from ctx.dataSourceManager

<!-- docs:splits:end -->
