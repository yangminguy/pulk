---
title: "SingleRecordResource"
description: "Resource for **single records**: data is one object; supports get by primary key, create/update (save), and destroy. Use for detail, form, and other \"single record\" scenarios. Unlike [MultiRecordResource](./multi-record-resource.md), SingleRecordResource's `getData()` returns a single object; use `setFilterByTk(id)` for primary key; `save()` auto-calls create or update based on `isNewRecord`."
---

# SingleRecordResource

Resource for **single records**: data is one object; supports get by primary key, create/update (save), and destroy. Use for detail, form, and other "single record" scenarios. Unlike [MultiRecordResource](/runjs/resource/multi-record-resource.md), SingleRecordResource's `getData()` returns a single object; use `setFilterByTk(id)` for primary key; `save()` auto-calls create or update based on `isNewRecord`.

**Inheritance**: FlowResource → APIResource → BaseRecordResource → SingleRecordResource.

**Create with**: `ctx.makeResource('SingleRecordResource')` or `ctx.initResource('SingleRecordResource')`. Before use call `setResourceName('collectionName')`; for operations by primary key call `setFilterByTk(id)`; RunJS injects `ctx.api`.

---

## Use cases

| Scenario | Description |
|----------|-------------|
| **Detail block** | Detail block uses SingleRecordResource by default; loads single record by primary key |
| **Form block** | Create/edit forms use SingleRecordResource; `save()` auto-distinguishes create vs update |
| **JSBlock detail** | Load single user, order, etc. in JSBlock and render custom UI |
| **Association resources** | Load associated single record with `users.profile`; requires `setSourceId(parentRecordId)` |

---

## Data format

- `getData()` returns a **single record object**, i.e. the get API `data` field
- `getMeta()` returns metadata (if any)

---

## Resource name and primary key

| Method | Description |
|--------|-------------|
| `setResourceName(name)` / `getResourceName()` | Resource name, e.g. `'users'`, `'users.profile'` (association) |
| `setSourceId(id)` / `getSourceId()` | Parent record id for association resources (e.g. `users.profile` needs users primary key) |
| `setDataSourceKey(key)` / `getDataSourceKey()` | Data source key (for multiple data sources) |
| `setFilterByTk(tk)` / `getFilterByTk()` | Current record primary key; after set, `isNewRecord` is false |

---

## State

| Property/Method | Description |
|-----------------|-------------|
| `isNewRecord` | Whether in "create" state (true when filterByTk not set or just created) |

---

## Request params (filter / fields)

| Method | Description |
|--------|-------------|
| `setFilter(filter)` / `getFilter()` | Filter (when not new) |
| `setFields(fields)` / `getFields()` | Requested fields |
| `setAppends(appends)` / `getAppends()` / `addAppends` / `removeAppends` | Association expansion |

---

## CRUD

| Method | Description |
|--------|-------------|
| `refresh()` | Request get with current `filterByTk`; update `getData()`. No request when in new state. |
| `save(data, options?)` | Create when new, otherwise update; optional `{ refresh: false }` to skip auto refresh |
| `destroy(options?)` | Delete by current `filterByTk` and clear local data |
| `runAction(actionName, options)` | Call any resource action |

---

## Config and events

| Method | Description |
|--------|-------------|
| `setSaveActionOptions(options)` | Request config for save |
| `on('refresh', fn)` / `on('saved', fn)` | Fired when refresh completes or after save |

---

## Examples

## Notes

- **setResourceName required**: Must call `setResourceName('collectionName')` before use; otherwise request URL cannot be built.
- **filterByTk and isNewRecord**: When `setFilterByTk` is not set, `isNewRecord` is true; `refresh()` does not send request; `save()` does create.
- **Association resources**: When resource name is `parent.child` (e.g. `users.profile`), call `setSourceId(parentPrimaryKey)` first.
- **getData is object**: Single record API returns `data` as record object; `getData()` returns that object; after `destroy()` it is null.

---

## Related

- [ctx.resource](/runjs/context/resource.md) - Resource instance in current context
- [ctx.initResource()](/runjs/context/init-resource.md) - Initialize and bind to ctx.resource
- [ctx.makeResource()](/runjs/context/make-resource.md) - Create resource instance without binding
- [APIResource](/runjs/resource/api-resource.md) - Generic API resource, request by URL
- [MultiRecordResource](/runjs/resource/multi-record-resource.md) - For data tables/lists, CRUD, pagination

<!-- docs:splits:start -->

## Extracted references

- **Basic get and update Example** (`runjs/resource/single-record-resource__example-1.md`) - Extracted example from SingleRecordResource
- **Create record Example** (`runjs/resource/single-record-resource__example-2.md`) - Extracted example from SingleRecordResource
- **Delete record Example** (`runjs/resource/single-record-resource__example-3.md`) - Extracted example from SingleRecordResource
- **Association expansion and fields Example** (`runjs/resource/single-record-resource__example-4.md`) - Extracted example from SingleRecordResource
- **Association resource (e.g. users.profile) Example** (`runjs/resource/single-record-resource__example-5.md`) - Extracted example from SingleRecordResource
- **save without auto refresh Example** (`runjs/resource/single-record-resource__example-6.md`) - Extracted example from SingleRecordResource
- **Listen to refresh / saved events Example** (`runjs/resource/single-record-resource__example-7.md`) - Extracted example from SingleRecordResource

<!-- docs:splits:end -->
