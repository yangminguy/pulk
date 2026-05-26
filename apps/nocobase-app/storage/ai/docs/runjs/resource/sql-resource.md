---
title: "SQLResource"
description: "Resource that runs queries via **saved SQL config** or **dynamic SQL**; data comes from `flowSql:run` / `flowSql:runById`, etc. Use for reports, stats, custom SQL lists. Unlike [MultiRecordResource](./multi-record-resource.md), SQLResource does not depend on data tables and runs SQL directly; supports pagination, parameter binding, template variables (`{{ctx.xxx}}`), and result type control."
---

# SQLResource

Resource that runs queries via **saved SQL config** or **dynamic SQL**; data comes from `flowSql:run` / `flowSql:runById`, etc. Use for reports, stats, custom SQL lists. Unlike [MultiRecordResource](/runjs/resource/multi-record-resource.md), SQLResource does not depend on data tables and runs SQL directly; supports pagination, parameter binding, template variables (`{{ctx.xxx}}`), and result type control.

**Inheritance**: FlowResource → APIResource → BaseRecordResource → SQLResource.

**Create with**: `ctx.makeResource('SQLResource')` or `ctx.initResource('SQLResource')`. For saved-config execution call `setFilterByTk(uid)` (SQL template uid); for debugging use `setDebug(true)` + `setSQL(sql)` to run SQL directly; RunJS injects `ctx.api`.

---

## Use cases

| Scenario | Description |
|----------|-------------|
| **Reports / stats** | Complex aggregations, cross-table queries, custom metrics |
| **JSBlock custom list** | Use SQL for special filter, sort, or join; render custom UI |
| **Chart block** | Save SQL template to drive chart data source; supports pagination |
| **vs ctx.sql** | Use SQLResource when you need pagination, events, or reactive data; use `ctx.sql.run()` / `ctx.sql.runById()` for simple one-off queries |

---

## Data format

- `getData()` returns different formats based on `setSQLType()`:
  - `selectRows` (default): **array**, multiple rows
  - `selectRow`: **single object**
  - `selectVar`: **scalar value** (e.g. COUNT, SUM)
- `getMeta()` returns pagination meta: `page`, `pageSize`, `count`, `totalPage`, etc.

---

## SQL config and execution mode

| Method | Description |
|--------|-------------|
| `setFilterByTk(uid)` | SQL template uid to run (for runById; must be saved first) |
| `setSQL(sql)` | Raw SQL (only in debug mode `setDebug(true)` for runBySQL) |
| `setSQLType(type)` | Result type: `'selectVar'` / `'selectRow'` / `'selectRows'` |
| `setDebug(enabled)` | When true, refresh uses `runBySQL()`; otherwise `runById()` |
| `run()` | Calls `runBySQL()` or `runById()` depending on debug |
| `runBySQL()` | Run current `setSQL` SQL (requires setDebug(true)) |
| `runById()` | Run saved SQL template by current uid |

---

## Params and context

| Method | Description |
|--------|-------------|
| `setBind(bind)` | Bound variables; object with `:name`, array with `?` |
| `setLiquidContext(ctx)` | Template context (Liquid) for `{{ctx.xxx}}` |
| `setFilter(filter)` | Extra filter (passed in request data) |
| `setDataSourceKey(key)` | Data source key (for multiple data sources) |

---

## Pagination

| Method | Description |
|--------|-------------|
| `setPage(page)` / `getPage()` | Current page (default 1) |
| `setPageSize(size)` / `getPageSize()` | Page size (default 20) |
| `next()` / `previous()` / `goto(page)` | Change page and trigger refresh |

Use `{{ctx.limit}}` and `{{ctx.offset}}` in SQL for pagination; SQLResource injects `limit` and `offset` into context.

---

## Data fetch and events

| Method | Description |
|--------|-------------|
| `refresh()` | Run SQL (runById or runBySQL); write result to `setData(data)` and update meta; emit `'refresh'` |
| `runAction(actionName, options)` | Call underlying APIs (e.g. `getBind`, `run`, `runById`) |
| `on('refresh', fn)` / `on('loading', fn)` | Fired when refresh completes or loading starts |

---

## Examples

## Notes

- **runById requires saved template**: `setFilterByTk(uid)` uid must be a saved SQL template ID; save via `ctx.sql.save({ uid, sql })`.
- **Debug mode needs permission**: `setDebug(true)` uses `flowSql:run`; requires SQL config permission. `runById` only needs login.
- **refresh debounce**: Multiple `refresh()` calls in the same event loop only run the last one to avoid duplicate requests.
- **Parameter binding prevents injection**: Use `setBind()` with `:name` / `?` placeholders; avoid string concatenation to prevent SQL injection.

---

## Related

- [ctx.sql](/runjs/context/sql.md) - SQL execution and management; `ctx.sql.runById` for simple one-off queries
- [ctx.resource](/runjs/context/resource.md) - Resource instance in current context
- [ctx.initResource()](/runjs/context/init-resource.md) - Initialize and bind to ctx.resource
- [ctx.makeResource()](/runjs/context/make-resource.md) - Create resource instance without binding
- [APIResource](/runjs/resource/api-resource.md) - Generic API resource
- [MultiRecordResource](/runjs/resource/multi-record-resource.md) - For data tables/lists

<!-- docs:splits:start -->

## Extracted references

- **Run by saved template (runById) Example** (`runjs/resource/sql-resource__example-1.md`) - Extracted example from SQLResource
- **Debug mode: run SQL directly (runBySQL) Example** (`runjs/resource/sql-resource__example-2.md`) - Extracted example from SQLResource
- **Pagination and navigation Example** (`runjs/resource/sql-resource__example-3.md`) - Extracted example from SQLResource
- **Result types Example** (`runjs/resource/sql-resource__example-4.md`) - Extracted example from SQLResource
- **Use template variables Example** (`runjs/resource/sql-resource__example-5.md`) - Extracted example from SQLResource
- **Listen to refresh event Example** (`runjs/resource/sql-resource__example-6.md`) - Extracted example from SQLResource

<!-- docs:splits:end -->
