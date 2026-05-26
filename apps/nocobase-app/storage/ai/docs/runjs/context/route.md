---
title: "ctx.route"
description: "Current route match info, corresponding to React Router’s route; used to get the matched route config, params, etc. Use with `ctx.router` and `ctx.location`."
---

# ctx.route

Current route match info, corresponding to React Router’s route; used to get the matched route config, params, etc. Use with `ctx.router` and `ctx.location`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField** | Conditional render or display based on `route.pathname` or `route.params` |
| **Linkage / event flow** | Read route params (e.g. `params.name`) for logic or pass to children |
| **View navigation** | Compare `ctx.route.pathname` with target path to decide `ctx.router.navigate` |

> Note: `ctx.route` is only available in RunJS when a router context exists (e.g. JSBlock on a page, Flow page); in pure backend or non-routed contexts (e.g. workflow) it may be empty.

## Common fields

| Field | Type | Description |
|-------|------|-------------|
| `pathname` | `string` | Full path of current route; same as `ctx.location.pathname` |
| `params` | `Record<string, any>` | Dynamic params from route template, e.g. `{ name: 'users' }` |
| `path` | `string` | Route template, e.g. `/admin/:name` |
| `name` | `string` | Route unique id; often used for tabs/views |

## Relation to ctx.router, ctx.location

| Use | Recommended |
|-----|-------------|
| **Current path** | `ctx.route.pathname` or `ctx.location.pathname`; they match when route is matched |
| **Route params** | `ctx.route.params`, e.g. `params.name` for current page UID |
| **Navigate** | `ctx.router.navigate(path)` |
| **Query params, state** | `ctx.location.search`, `ctx.location.state` |

`ctx.route` is “matched route config”; `ctx.location` is “current URL”; together they describe the current route state.

## Examples

## Related

- [ctx.router](/runjs/context/router.md): navigation; after `ctx.router.navigate()`, `ctx.route` updates
- [ctx.location](/runjs/context/location.md): current URL (pathname, search, hash, state); use with `ctx.route`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/route__example-1.md`) - Extracted example from ctx.route
- **Read pathname Example** (`runjs/context/route__example-2.md`) - Extracted example from ctx.route
- **Branch by params Example** (`runjs/context/route__example-3.md`) - Extracted example from ctx.route
- **In Flow page Example** (`runjs/context/route__example-4.md`) - Extracted example from ctx.route

<!-- docs:splits:end -->
