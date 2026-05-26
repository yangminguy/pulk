---
title: "Render in Container"
description: "Use `ctx.render()` to render content into the current container (`ctx.element`) in three ways:"
---

# Render in Container

Use `ctx.render()` to render content into the current container (`ctx.element`) in three ways:

## ctx.render()

## JSX Notes

RunJS can render JSX directly, using either the built-in React/component library or externally loaded dependencies.

## ctx.element

**Not recommended** (deprecated):

```js
ctx.element.innerHTML = '<h1>Hello World</h1>';
```

**Recommended**:

```js
ctx.render(<h1>Hello World</h1>);
```

<!-- docs:splits:start -->

## Extracted references

- **Render JSX Example** (`runjs/render__example-1.md`) - Extracted example from Render in Container
- **Render DOM Node Example** (`runjs/render__example-2.md`) - Extracted example from Render in Container
- **Render HTML String Example** (`runjs/render__example-3.md`) - Extracted example from Render in Container
- **Using Built-in React and Components Example** (`runjs/render__example-4.md`) - Extracted example from Render in Container
- **Using External React and Components Example** (`runjs/render__example-5.md`) - Extracted example from Render in Container
- **Using External React and Components Example** (`runjs/render__example-6.md`) - Extracted example from Render in Container
- **Using External React and Components Example** (`runjs/render__example-7.md`) - Extracted example from Render in Container

<!-- docs:splits:end -->
