---
title: "ctx.requireAsync()"
description: "Loads **UMD/AMD** or global scripts by URL asynchronously; can also load **CSS**. Use for ECharts, Chart.js, FullCalendar (UMD), jQuery plugins, etc. in RunJS; pass a `.css` URL to load and inject styles. If a library provides ESM, prefer [ctx.importAsync()](./import-async.md)."
---

# ctx.requireAsync()

Loads **UMD/AMD** or global scripts by URL asynchronously; can also load **CSS**. Use for ECharts, Chart.js, FullCalendar (UMD), jQuery plugins, etc. in RunJS; pass a `.css` URL to load and inject styles. If a library provides ESM, prefer [ctx.importAsync()](/runjs/context/import-async.md).

## Use Cases

Use whenever RunJS needs to load UMD/AMD/global scripts or CSS: JSBlock, JSField, JSItem, JSColumn, event flow, JSAction, etc. Typical: ECharts, Chart.js, FullCalendar (UMD), dayjs (UMD), jQuery plugins.

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Script or CSS URL. Supports **shorthand** `<package>@<version>/<path>` (ESM CDN adds `?raw` for raw UMD) or **full URL**. `.css` URLs load and inject styles. |

## Returns

- Loaded library object (first module value from UMD/AMD callback). Many UMD libs attach to `window` (e.g. `window.echarts`); return value may be `undefined`—use the library’s docs for how to access.
- For `.css` URLs, returns the result of `loadCSS`.

## URL format

- **Shorthand**: e.g. `echarts@5/dist/echarts.min.js`; with default ESM CDN (esm.sh) becomes `https://esm.sh/echarts@5/dist/echarts.min.js?raw`; `?raw` fetches the raw UMD file.
- **Full URL**: Any CDN URL, e.g. `https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js`.
- **CSS**: URLs ending in `.css` are loaded and injected.

## vs ctx.importAsync()

- **ctx.requireAsync()**: Loads **UMD/AMD/global** scripts; good for ECharts, Chart.js, FullCalendar (UMD), jQuery plugins; lib often on `window`; return may be the lib or `undefined`.
- **ctx.importAsync()**: Loads **ESM**; returns module namespace. If a lib has ESM, prefer `ctx.importAsync()` for better module semantics and tree-shaking.

## Examples

## Notes

- **Return shape**: UMD libs vary; return may be the lib or `undefined`; if `undefined`, use the lib’s docs (often `window`).
- **Network**: Requires CDN access; for intranet set **ESM_CDN_BASE_URL** to your own service.
- **Choice**: If a lib has both ESM and UMD, prefer `ctx.importAsync()`.

## Related

- [ctx.importAsync()](/runjs/context/import-async.md): load ESM; good for Vue, dayjs (ESM), etc.
- [ctx.render()](/runjs/context/render.md): render charts etc. into container
- [ctx.libs](/runjs/context/libs.md): built-in React, antd, dayjs; no async load

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/require-async__example-1.md`) - Extracted example from ctx.requireAsync()
- **Basic Example** (`runjs/context/require-async__example-2.md`) - Extracted example from ctx.requireAsync()
- **ECharts Example** (`runjs/context/require-async__example-3.md`) - Extracted example from ctx.requireAsync()
- **Chart.js bar Example** (`runjs/context/require-async__example-4.md`) - Extracted example from ctx.requireAsync()
- **dayjs (UMD) Example** (`runjs/context/require-async__example-5.md`) - Extracted example from ctx.requireAsync()

<!-- docs:splits:end -->
