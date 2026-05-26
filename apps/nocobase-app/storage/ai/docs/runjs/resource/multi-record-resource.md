---
title: "MultiRecordResource"
description: "Resource for **data tables/lists**: request returns an array; supports pagination, filter, sort, and CRUD. Use for tables, lists, and other \"multiple records\" scenarios. Unlike [APIResource](./api-resource.md), MultiRecordResource uses `setResourceName()` to specify resource name and auto-builds URLs like `users:list`, `users:create`, with built-in pagination, filter, and selected rows."
---

# MultiRecordResource

Resource for **data tables/lists**: request returns an array; supports pagination, filter, sort, and CRUD. Use for tables, lists, and other "multiple records" scenarios. Unlike [APIResource](/runjs/resource/api-resource.md), MultiRecordResource uses `setResourceName()` to specify resource name and auto-builds URLs like `users:list`, `users:create`, with built-in pagination, filter, and selected rows.

**Inheritance**: FlowResource → APIResource → BaseRecordResource → MultiRecordResource.

**Create with**: `ctx.makeResource('MultiRecordResource')` or `ctx.initResource('MultiRecordResource')`. Before use call `setResourceName('collectionName')` (e.g. `'users'`); RunJS injects `ctx.api`.

---

## Use cases

| Scenario | Description |
|----------|-------------|
| **Table block** | Table and list blocks use MultiRecordResource by default; pagination, filter, sort |
| **JSBlock list** | Load users, orders, etc. in JSBlock and render custom UI |
| **Batch operations** | Use `getSelectedRows()` for selected rows, `destroySelectedRows()` for batch delete |
| **Association resources** | Load associated data with `users.tags`; requires `setSourceId(parentRecordId)` |

---

## Data format

- `getData()` returns a **record array**, i.e. the list API `data` field
- `getMeta()` returns pagination meta: `page`, `pageSize`, `count`, `totalPage`, etc.

---

## Resource name and data source

| Method | Description |
|--------|-------------|
| `setResourceName(name)` / `getResourceName()` | Resource name, e.g. `'users'`, `'users.tags'` (association) |
| `setSourceId(id)` / `getSourceId()` | Parent record id for association resources (e.g. `users.tags` needs users primary key) |
| `setDataSourceKey(key)` / `getDataSourceKey()` | Data source key (for multiple data sources) |

---

## Request params (filter / fields / sort)

| Method | Description |
|--------|-------------|
| `setFilterByTk(tk)` / `getFilterByTk()` | Primary key filter (single get, etc.) |
| `setFilter(filter)` / `getFilter()` / `resetFilter()` | Filter; supports `$eq`, `$ne`, `$in`, etc. |
| `addFilterGroup(key, filter)` / `removeFilterGroup(key)` | Filter groups (combine conditions) |
| `setFields(fields)` / `getFields()` | Requested fields (whitelist) |
| `setSort(sort)` / `getSort()` | Sort, e.g. `['-createdAt']` for created-at desc |
| `setAppends(appends)` / `getAppends()` / `addAppends` / `removeAppends` | Association expansion (e.g. `['user', 'tags']`) |

---

## Pagination

| Method | Description |
|--------|-------------|
| `setPage(page)` / `getPage()` | Current page (1-based) |
| `setPageSize(size)` / `getPageSize()` | Page size, default 20 |
| `getTotalPage()` | Total pages |
| `getCount()` | Total count (from server meta) |
| `next()` / `previous()` / `goto(page)` | Change page and trigger refresh |

---

## Selected rows (table)

| Method | Description |
|--------|-------------|
| `setSelectedRows(rows)` / `getSelectedRows()` | Currently selected row data for batch delete, etc. |

---

## CRUD and list operations

| Method | Description |
|--------|-------------|
| `refresh()` | Request list with current params; update `getData()` and pagination meta; emit `'refresh'` |
| `get(filterByTk)` | Request single record; returns that record (does not write to getData) |
| `create(data, options?)` | Create; optional `{ refresh: false }` to skip auto refresh; emit `'saved'` |
| `update(filterByTk, data, options?)` | Update by primary key |
| `destroy(target)` | Delete; target can be primary key, row object, or array (batch delete) |
| `destroySelectedRows()` | Delete selected rows (throws if none selected) |
| `setItem(index, item)` | Replace one row locally (no request) |
| `runAction(actionName, options)` | Call any resource action (e.g. custom action) |

---

## Config and events

| Method | Description |
|--------|-------------|
| `setRefreshAction(name)` | Action used for refresh; default `'list'` |
| `setCreateActionOptions(options)` / `setUpdateActionOptions(options)` | Request config for create/update |
| `on('refresh', fn)` / `on('saved', fn)` | Fired when refresh completes or after save |

---

## Examples

## Notes

- **setResourceName required**: Must call `setResourceName('collectionName')` before use; otherwise request URL cannot be built.
- **Association resources**: When resource name is `parent.child` (e.g. `users.tags`), call `setSourceId(parentPrimaryKey)` first.
- **refresh debounce**: Multiple `refresh()` calls in the same event loop only run the last one to avoid duplicate requests.
- **getData is array**: List API returns `data` as record array; `getData()` returns that array directly.

---

## Related

- [ctx.resource](/runjs/context/resource.md) - Resource instance in current context
- [ctx.initResource()](/runjs/context/init-resource.md) - Initialize and bind to ctx.resource
- [ctx.makeResource()](/runjs/context/make-resource.md) - Create resource instance without binding
- [APIResource](/runjs/resource/api-resource.md) - Generic API resource, request by URL
- [SingleRecordResource](/runjs/resource/single-record-resource.md) - For single records

<!-- docs:splits:start -->

## Extracted references

- **Basic list Example** (`runjs/resource/multi-record-resource__example-1.md`) - Extracted example from MultiRecordResource
- **Filter and sort Example** (`runjs/resource/multi-record-resource__example-2.md`) - Extracted example from MultiRecordResource
- **Association expansion Example** (`runjs/resource/multi-record-resource__example-3.md`) - Extracted example from MultiRecordResource
- **Create and pagination Example** (`runjs/resource/multi-record-resource__example-4.md`) - Extracted example from MultiRecordResource
- **Batch delete selected rows Example** (`runjs/resource/multi-record-resource__example-5.md`) - Extracted example from MultiRecordResource
- **Listen to refresh event Example** (`runjs/resource/multi-record-resource__example-6.md`) - Extracted example from MultiRecordResource
- **Association resource (child table) Example** (`runjs/resource/multi-record-resource__example-7.md`) - Extracted example from MultiRecordResource

<!-- docs:splits:end -->
