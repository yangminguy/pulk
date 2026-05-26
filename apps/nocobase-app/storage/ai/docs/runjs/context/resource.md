---
title: "ctx.resource"
description: "The **FlowResource** instance in the current context; used to access and operate on data. In most blocks (form, table, detail, etc.) and popups, the runtime binds `ctx.resource`; in JSBlock and similar contexts that have no resource by default, call [ctx.initResource()](./init-resource.md) first, then use `ctx.resource`."
---

# ctx.resource

The **FlowResource** instance in the current context; used to access and operate on data. In most blocks (form, table, detail, etc.) and popups, the runtime binds `ctx.resource`; in JSBlock and similar contexts that have no resource by default, call [ctx.initResource()](/runjs/context/init-resource.md) first, then use `ctx.resource`.

## Use Cases

Use whenever RunJS needs structured data (list, single record, custom API, SQL). Form, table, detail blocks and popups usually have it bound; in JSBlock, JSField, JSItem, JSColumn, etc., call `ctx.initResource(type)` first if you need to load data.

## Common methods

Different resource types (MultiRecordResource, SingleRecordResource, APIResource, SQLResource) expose slightly different APIs; common ones:

| Method | Description |
|--------|-------------|
| `getData()` | Current data (list or single record) |
| `setData(value)` | Set local data |
| `refresh()` | Refetch with current params |
| `setResourceName(name)` | Set resource name (e.g. `'users'`, `'users.tags'`) |
| `setFilterByTk(tk)` | Set primary key filter (single get, etc.) |
| `runAction(actionName, options)` | Call any resource action (e.g. `create`, `update`) |
| `on(event, callback)` / `off(event, callback)` | Subscribe/unsubscribe (e.g. `refresh`, `saved`) |

**MultiRecordResource**: `getSelectedRows()`, `destroySelectedRows()`, `setPage()`, `next()`, `previous()`, etc.

## Examples

## Relation to ctx.initResource / ctx.makeResource

- **ctx.initResource(type)**: Creates and binds if missing; otherwise returns existing. Ensures `ctx.resource` is set.
- **ctx.makeResource(type)**: Creates a new instance and returns it; **does not** set `ctx.resource`. Use when you need multiple resources or a temporary one.
- **ctx.resource**: The bound resource in the current context. Most blocks/popups have it; when not bound it is `undefined` and you must call `ctx.initResource` first.

## Notes

- Prefer null checks: `ctx.resource?.refresh()`, especially in JSBlock and similar contexts.
- After init, call `setResourceName(name)` then `refresh()` to load data.
- See the resource type docs for full API.

## Related

- [ctx.initResource()](/runjs/context/init-resource.md): init and bind resource
- [ctx.makeResource()](/runjs/context/make-resource.md): create resource without binding
- [MultiRecordResource](/runjs/resource/multi-record-resource.md)
- [SingleRecordResource](/runjs/resource/single-record-resource.md)
- [APIResource](/runjs/resource/api-resource.md)
- [SQLResource](/runjs/resource/sql-resource.md)

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/resource__example-1.md`) - Extracted example from ctx.resource
- **List (after initResource) Example** (`runjs/context/resource__example-2.md`) - Extracted example from ctx.resource
- **Table (pre-bound) Example** (`runjs/context/resource__example-3.md`) - Extracted example from ctx.resource
- **Single record Example** (`runjs/context/resource__example-4.md`) - Extracted example from ctx.resource
- **Custom action Example** (`runjs/context/resource__example-5.md`) - Extracted example from ctx.resource

<!-- docs:splits:end -->
