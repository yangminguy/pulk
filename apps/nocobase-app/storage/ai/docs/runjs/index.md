---
title: "RunJS Overview"
description: "RunJS is the JavaScript execution environment in NocoBase used for **JS Block**, **JS Field**, **JS Action**, and similar scenarios. Code runs in a restricted sandbox with safe access to the `ctx` (context API) and supports:"
---

# RunJS Overview

RunJS is the JavaScript execution environment in NocoBase used for **JS Block**, **JS Field**, **JS Action**, and similar scenarios. Code runs in a restricted sandbox with safe access to the `ctx` (context API) and supports:

- Top-level `await`
- Importing external modules
- Render in container
- Global variables

## Importing External Modules

- ESM modules: use `ctx.importAsync()` (recommended)
- UMD/AMD modules: use `ctx.requireAsync()`

## Render in Container

Use `ctx.render()` to render content into the current container (`ctx.element`) in three ways:

## Global Variables

- `window`
- `document`
- `navigator`
- `ctx`

<!-- docs:references:start -->

## References

- **Document** (`runjs/document.md`) - Reference snippet for Document
- **Import Modules** (`runjs/import-modules.md`) - In RunJS you can use two kinds of modules: **built-in modules** (via `ctx.libs`, no import needed) and **external modules** (loaded on demand via `ctx.importAsync()` or `ctx.requireAsync()`).
- **JSX** (`runjs/jsx.md`) - RunJS supports JSX; you can write code like React components, and JSX is compiled before execution.
- **Render in Container** (`runjs/render.md`) - Use `ctx.render()` to render content into the current container (`ctx.element`) in three ways:
- **window** (`runjs/window.md`) - The following are available on `window`:

<!-- docs:references:end -->

<!-- docs:splits:start -->

## Extracted references

- **Top-level `await` Example** (`runjs/index__example-1.md`) - Extracted example from RunJS Overview
- **Top-level `await` Example** (`runjs/index__example-2.md`) - Extracted example from RunJS Overview
- **Render JSX Example** (`runjs/index__example-3.md`) - Extracted example from RunJS Overview
- **Render DOM Node Example** (`runjs/index__example-4.md`) - Extracted example from RunJS Overview
- **Render HTML String Example** (`runjs/index__example-5.md`) - Extracted example from RunJS Overview

<!-- docs:splits:end -->
