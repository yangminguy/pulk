---
title: "ctx.router"
description: "Router instance based on React Router; used for programmatic navigation in RunJS. Use with `ctx.route` and `ctx.location`."
---

# ctx.router

Router instance based on React Router; used for programmatic navigation in RunJS. Use with `ctx.route` and `ctx.location`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField** | Button navigates to detail, list, or external link |
| **Linkage / event flow** | After submit success, `navigate` to list or detail, or pass state to target |
| **JSAction / event handler** | Navigate on form submit, link click, etc. |
| **View navigation** | Update URL when switching views |

> Note: `ctx.router` is only available in RunJS when a router context exists (e.g. JSBlock on a page, Flow page, event flow); in pure backend or non-routed contexts (e.g. workflow) it may be empty.

## Methods

## Examples

## Relation to ctx.route, ctx.location

| Use | Recommended |
|-----|-------------|
| **Navigate** | `ctx.router.navigate(path)` |
| **Current path** | `ctx.route.pathname` or `ctx.location.pathname` |
| **State from navigation** | `ctx.location.state` |
| **Route params** | `ctx.route.params` |

`ctx.router` does “navigation”; `ctx.route` and `ctx.location` describe “current route state”.

## Notes

- `navigate(path)` by default pushes a new history entry; user can use browser back.
- `replace: true` replaces the current entry; use after login redirect, submit-success redirect, etc.
- **`state`**: Data in `state` is not in the URL; target page reads it via `ctx.location.state`. State is stored in history (back/forward keep it); it is lost on page refresh.

## Related

- [ctx.route](/runjs/context/route.md): current route match (pathname, params)
- [ctx.location](/runjs/context/location.md): current URL; read `state` here after navigation

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/router__example-1.md`) - Extracted example from ctx.router
- **ctx.router.navigate() Example** (`runjs/context/router__example-2.md`) - Extracted example from ctx.router
- **Basic navigation Example** (`runjs/context/router__example-3.md`) - Extracted example from ctx.router
- **Replace (no new history entry) Example** (`runjs/context/router__example-4.md`) - Extracted example from ctx.router
- **Pass state Example** (`runjs/context/router__example-5.md`) - Extracted example from ctx.router
- **Back and refresh Example** (`runjs/context/router__example-6.md`) - Extracted example from ctx.router

<!-- docs:splits:end -->
