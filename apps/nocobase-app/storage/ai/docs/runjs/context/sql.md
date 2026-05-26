---
title: "ctx.sql"
description: "`ctx.sql` provides SQL execution and management, often used in RunJS (e.g. JSBlock, event flow) to access the database directly. It supports ad-hoc SQL, running saved SQL templates by ID, parameter binding, template variables (`{{ctx.xxx}}`), and result type control."
---

# ctx.sql

`ctx.sql` provides SQL execution and management, often used in RunJS (e.g. JSBlock, event flow) to access the database directly. It supports ad-hoc SQL, running saved SQL templates by ID, parameter binding, template variables (`{{ctx.xxx}}`), and result type control.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | Custom reports, complex filtered lists, cross-table aggregation |
| **Chart block** | Saved SQL templates as chart data source |
| **Event flow / linkage** | Run predefined SQL and use results in logic |
| **SQLResource** | With `ctx.initResource('SQLResource')` for paginated lists, etc. |

> Note: `ctx.sql` uses the `flowSql` API to access the database; ensure the current user has execute permission on the target data source.

## Permissions

| Permission | Method | Description |
|------------|--------|-------------|
| **Logged-in user** | `runById` | Run by configured SQL template ID |
| **SQL config permission** | `run`, `save`, `destroy` | Ad-hoc SQL, save/update/delete SQL templates |

Front-end logic for normal users can use `ctx.sql.runById(uid, options)`; for dynamic SQL or template management, the current role must have SQL config permission.

## Common Methods

| Method | Description | Permission |
|--------|-------------|------------|
| `ctx.sql.run(sql, options?)` | Run ad-hoc SQL; supports parameter binding and template variables | SQL config |
| `ctx.sql.save({ uid, sql, dataSourceKey? })` | Save/update SQL template by ID for reuse | SQL config |
| `ctx.sql.runById(uid, options?)` | Run saved SQL template by ID | Any logged-in user |
| `ctx.sql.destroy(uid)` | Delete SQL template by ID | SQL config |

- `run`: for debugging SQL; requires config permission.
- `save`, `destroy`: for managing SQL templates; require config permission.
- `runById`: available to normal users; only runs saved templates.
- Call `save` when a SQL template changes.

## Options

### run / runById options

| Option | Type | Description |
|--------|------|-------------|
| `bind` | `Record<string, any>` | Bound variables. Use `$name` in SQL and pass object `{ name: value }` |
| `type` | `'selectRows'` \| `'selectRow'` \| `'selectVar'` | Result type: multiple rows, single row, single value; default `selectRows` |
| `dataSourceKey` | `string` | Data source key; default is main data source |
| `filter` | `Record<string, any>` | Extra filter (if supported) |

### save options

| Option | Type | Description |
|--------|------|-------------|
| `uid` | `string` | Template unique id; use with `runById(uid, ...)` |
| `sql` | `string` | SQL text; supports `{{ctx.xxx}}` and `$name` placeholders |
| `dataSourceKey` | `string` | Optional data source key |

## Template Variables and Parameter Binding

## Examples

## Relation to ctx.resource, ctx.request

| Use | Recommended |
|-----|-------------|
| **Run SQL** | `ctx.sql.run()` or `ctx.sql.runById()` |
| **SQL paginated list (block)** | `ctx.initResource('SQLResource')` + `ctx.resource.refresh()` |
| **Generic HTTP** | `ctx.request()` |

`ctx.sql` wraps the `flowSql` API for SQL; `ctx.request` is for arbitrary API calls.

## Notes

- Use parameter binding (`$name`) instead of string concatenation to avoid SQL injection.
- With `type: 'selectVar'` the result is a scalar (e.g. for `COUNT`, `SUM`).
- Template variables `{{ctx.xxx}}` are resolved before execution; ensure the context defines them.

## Related

- [ctx.resource](/runjs/context/resource.md): data resource; SQLResource uses flowSql internally
- [ctx.initResource()](/runjs/context/init-resource.md): initialize SQLResource for paginated lists
- [ctx.request()](/runjs/context/request.md): generic HTTP requests

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/sql__example-1.md`) - Extracted example from ctx.sql
- **Template variables `{{ctx.xxx}}` Example** (`runjs/context/sql__example-2.md`) - Extracted example from ctx.sql
- **Parameter binding Example** (`runjs/context/sql__example-3.md`) - Extracted example from ctx.sql
- **Ad-hoc SQL (requires SQL config permission) Example** (`runjs/context/sql__example-4.md`) - Extracted example from ctx.sql
- **Template variables Example** (`runjs/context/sql__example-5.md`) - Extracted example from ctx.sql
- **Save template and reuse Example** (`runjs/context/sql__example-6.md`) - Extracted example from ctx.sql
- **Paginated list (SQLResource) Example** (`runjs/context/sql__example-7.md`) - Extracted example from ctx.sql

<!-- docs:splits:end -->
