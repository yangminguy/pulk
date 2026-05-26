---
title: "ctx.importAsync()"
description: "Dynamically loads **ESM modules** or **CSS** by URL; use in all RunJS scenarios. For third-party ESM use `ctx.importAsync()`; for UMD/AMD use `ctx.requireAsync()`. Pass a `.css` URL to load and inject styles."
---

# ctx.importAsync()

Dynamically loads **ESM modules** or **CSS** by URL; use in all RunJS scenarios. For third-party ESM use `ctx.importAsync()`; for UMD/AMD use `ctx.requireAsync()`. Pass a `.css` URL to load and inject styles.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | Load Vue, ECharts, Tabulator, etc. for custom charts, tables, boards |
| **JSField / JSItem / JSColumn** | Load small ESM utils (e.g. dayjs plugins) for rendering |
| **Event flow / action events** | Load dependencies then run logic |

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | ESM or CSS URL. Supports shorthand `<package>@<version>` or subpath `<package>@<version>/<path>` (e.g. `vue@3.4.0`, `dayjs@1/plugin/relativeTime.js`), resolved with configured CDN prefix; full URLs also supported. For `.css` URLs, loads and injects styles. For React-dependent libs add `?deps=react@18.2.0,react-dom@18.2.0` to share the same React instance. |

## Returns

- Resolved module namespace object (Promise value).

## URL format

- **ESM and CSS**: Besides ESM, you can load CSS (pass a `.css` URL; it is injected into the page).
- **Shorthand**: When not configured, **https://esm.sh** is used as CDN prefix. E.g. `vue@3.4.0` → `https://esm.sh/vue@3.4.0`.
- **?deps**: For React-dependent libs (e.g. `@dnd-kit/core`, `react-big-calendar`) add `?deps=react@18.2.0,react-dom@18.2.0` to avoid Invalid hook call from multiple React instances.
- **Self-hosted CDN**: Set env vars for intranet or custom service:
  - **ESM_CDN_BASE_URL**: ESM CDN base (default `https://esm.sh`)
  - **ESM_CDN_SUFFIX**: Optional suffix (e.g. jsDelivr `/+esm`)
  - Reference: [nocobase/esm-server](https://github.com/nocobase/esm-server)

## vs ctx.requireAsync()

- **ctx.importAsync()**: Loads **ESM**; returns module namespace; good for Vue, dayjs, etc. (ESM builds).
- **ctx.requireAsync()**: Loads **UMD/AMD** or global scripts; good for ECharts, FullCalendar (UMD), etc. If a lib has ESM, prefer `ctx.importAsync()`.

## Examples

## Notes

- Depends on network/CDN; for intranet set **ESM_CDN_BASE_URL** to your own service.
- When a lib has both ESM and UMD, prefer `ctx.importAsync()` for better module semantics.
- For React-dependent libs always add `?deps=react@18.2.0,react-dom@18.2.0` (or the version your app uses) to avoid Invalid hook call.

## Related

- [ctx.requireAsync()](/runjs/context/require-async.md): load UMD/AMD or global scripts; good for ECharts, FullCalendar (UMD)
- [ctx.render()](/runjs/context/render.md): render into container

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/import-async__example-1.md`) - Extracted example from ctx.importAsync()
- **Basic Example** (`runjs/context/import-async__example-2.md`) - Extracted example from ctx.importAsync()
- **ECharts Example** (`runjs/context/import-async__example-3.md`) - Extracted example from ctx.importAsync()
- **Tabulator Example** (`runjs/context/import-async__example-4.md`) - Extracted example from ctx.importAsync()
- **FullCalendar (ESM) Example** (`runjs/context/import-async__example-5.md`) - Extracted example from ctx.importAsync()
- **dnd-kit (with ?deps) Example** (`runjs/context/import-async__example-6.md`) - Extracted example from ctx.importAsync()
- **react-big-calendar Example** (`runjs/context/import-async__example-7.md`) - Extracted example from ctx.importAsync()

<!-- docs:splits:end -->
