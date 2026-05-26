---
title: "ctx.location"
description: "Current route location, equivalent to React Router’s `location`. Use with `ctx.router` and `ctx.route` to read pathname, search, hash, and state passed via navigation."
---

# ctx.location

Current route location, equivalent to React Router’s `location`. Use with `ctx.router` and `ctx.route` to read pathname, search, hash, and state passed via navigation.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField** | Conditional render or logic based on path, query, or hash |
| **Linkage / event flow** | Read URL params for filtering or use `location.state` for source |
| **After navigation** | On target page, read `ctx.location.state` from `ctx.router.navigate` |

> Note: `ctx.location` is only available in RunJS when a router context exists (e.g. JSBlock on a page, event flow); in pure backend or non-routed contexts (e.g. workflow) it may be empty.

## Common Fields

| Field | Type | Description |
|-------|------|-------------|
| `pathname` | `string` | Current path, leading `/` (e.g. `/admin/users`) |
| `search` | `string` | Query string, leading `?` (e.g. `?page=1&status=active`) |
| `hash` | `string` | Hash fragment, leading `#` (e.g. `#section-1`) |
| `state` | `any` | Data passed via `ctx.router.navigate(path, { state })`; not in URL |
| `key` | `string` | Unique key for this location; initial page is `"default"` |

## Relation to ctx.router, ctx.urlSearchParams

| Use | Recommended |
|-----|-------------|
| **Path, hash, state** | `ctx.location.pathname` / `ctx.location.hash` / `ctx.location.state` |
| **Query params as object** | `ctx.urlSearchParams` |
| **Parse search** | `new URLSearchParams(ctx.location.search)` or `ctx.urlSearchParams` |

`ctx.urlSearchParams` is derived from `ctx.location.search`; use it when you only need query params.

## Examples

## Related

- [ctx.router](/runjs/context/router.md): navigation; `state` from `ctx.router.navigate` is available as `ctx.location.state`
- [ctx.route](/runjs/context/route.md): current route match (params, config); use with `ctx.location`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/location__example-1.md`) - Extracted example from ctx.location
- **Branch by path Example** (`runjs/context/location__example-2.md`) - Extracted example from ctx.location
- **Parse query params Example** (`runjs/context/location__example-3.md`) - Extracted example from ctx.location
- **Read state from navigation Example** (`runjs/context/location__example-4.md`) - Extracted example from ctx.location
- **Anchor by hash Example** (`runjs/context/location__example-5.md`) - Extracted example from ctx.location

<!-- docs:splits:end -->
