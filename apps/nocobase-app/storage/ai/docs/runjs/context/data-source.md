---
title: "ctx.dataSource"
description: "The data source instance (`DataSource`) bound to the current RunJS context; used to access collections, field metadata, and collection config **within that data source**. Usually the current page/block’s data source (e.g. main `main`)."
---

# ctx.dataSource

The data source instance (`DataSource`) bound to the current RunJS context; used to access collections, field metadata, and collection config **within that data source**. Usually the current page/block’s data source (e.g. main `main`).

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Single data source** | Get collections, field metadata when the current data source is known |
| **Collection management** | Get/add/update/remove collections in the current data source |
| **Field by path** | Get field definition by `collectionName.fieldPath` (supports association path) |

> Note: `ctx.dataSource` is the single data source for the current context; to enumerate or access other data sources use [ctx.dataSourceManager](/runjs/context/data-source-manager.md).

## Common Properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Data source key (e.g. `main`) |
| `name` | `string` | Same as key |
| `displayName` | `string` | Display name (i18n) |
| `flowEngine` | `FlowEngine` | Current FlowEngine instance |

## Common Methods

| Method | Description |
|--------|-------------|
| `getCollections()` | All collections in this data source (sorted, hidden filtered) |
| `getCollection(name)` | Collection by name; `name` can be `collectionName.fieldName` for association target |
| `getAssociation(associationName)` | Association field by `collectionName.fieldName` |
| `getCollectionField(fieldPath)` | Field by `collectionName.fieldPath`; supports paths like `users.profile.avatar` |

## Relation to ctx.dataSourceManager

| Need | Recommended |
|------|-------------|
| **Single data source for context** | `ctx.dataSource` |
| **Entry to all data sources** | `ctx.dataSourceManager` |
| **Collection in current data source** | `ctx.dataSource.getCollection(name)` |
| **Collection in another data source** | `ctx.dataSourceManager.getCollection(dataSourceKey, collectionName)` |
| **Field in current data source** | `ctx.dataSource.getCollectionField('users.profile.avatar')` |
| **Field across data sources** | `ctx.dataSourceManager.getCollectionField('main.users.profile.avatar')` |

## Examples

## Notes

- `getCollectionField(fieldPath)` uses path format `collectionName.fieldPath`; first segment is collection name, rest is field path (supports association, e.g. `user.name`).
- `getCollection(name)` supports `collectionName.fieldName` and returns the association target collection.
- In RunJS, `ctx.dataSource` is usually determined by the current block/page; if there is no bound data source it may be `undefined`—check before use.

## Related

- [ctx.dataSourceManager](/runjs/context/data-source-manager.md): manager for all data sources
- [ctx.collection](/runjs/context/collection.md): collection for current context
- [ctx.collectionField](/runjs/context/collection-field.md): current field’s collection field definition

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/data-source__example-1.md`) - Extracted example from ctx.dataSource
- **Get collections and fields Example** (`runjs/context/data-source__example-2.md`) - Extracted example from ctx.dataSource
- **Get association field Example** (`runjs/context/data-source__example-3.md`) - Extracted example from ctx.dataSource
- **Iterate collections Example** (`runjs/context/data-source__example-4.md`) - Extracted example from ctx.dataSource
- **Validation or dynamic UI from field metadata Example** (`runjs/context/data-source__example-5.md`) - Extracted example from ctx.dataSource

<!-- docs:splits:end -->
