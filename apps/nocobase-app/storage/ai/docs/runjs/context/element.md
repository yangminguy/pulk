---
title: "ctx.element"
description: "The ElementProxy instance for the sandbox DOM container; it is the default render target of `ctx.render()`. Available in JSBlock, JSField, JSItem, JSColumn, and other contexts that have a render container."
---

# ctx.element

The ElementProxy instance for the sandbox DOM container; it is the default render target of `ctx.render()`. Available in JSBlock, JSField, JSItem, JSColumn, and other contexts that have a render container.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | Block’s DOM container for custom content |
| **JSField / JSItem / FormJSFieldItem** | Field/item render container (often a `<span>`) |
| **JSColumn** | Table cell DOM container for custom column content |

> Note: `ctx.element` is only available in RunJS contexts that have a render container; in contexts without UI (e.g. pure backend) it may be `undefined`—check before use.

## Security

**Recommended: do all rendering via `ctx.render()`.** Do not use `ctx.element`’s DOM APIs directly (e.g. `innerHTML`, `appendChild`, `querySelector`).

### Why use ctx.render()

| Benefit | Description |
|---------|-------------|
| **Security** | Centralized control, avoids XSS and unsafe DOM use |
| **React** | Full JSX, components, and lifecycle |
| **Context** | Inherits app ConfigProvider, theme, etc. |
| **Conflicts** | Manages React root create/unmount, avoids multiple instances |

## Exception: popover anchor

When you need the current element as a popover anchor, use `ctx.element?.__el` as the native DOM `target`:

```ts
await ctx.viewer.popover({
  target: ctx.element?.__el,
  content: <div>Popover content</div>,
});
```

> Use `__el` only for this “current container as anchor” case; do not touch DOM otherwise.

## Relation to ctx.render

- `ctx.render(vnode)` without a `container` argument renders into `ctx.element`.
- If there is no `ctx.element` and no `container`, an error is thrown.
- You can pass a container: `ctx.render(vnode, customContainer)`.

## Notes

- Treat `ctx.element` as the internal container for `ctx.render()`; avoid reading or mutating it directly.
- In contexts without a render container, `ctx.element` is `undefined`; ensure a container exists or pass `container` to `ctx.render()`.
- ElementProxy’s `innerHTML`/`outerHTML` are sanitized with DOMPurify, but prefer `ctx.render()` for all rendering.

## Related

- [ctx.render](/runjs/context/render.md): render into container
- [ctx.view](/runjs/context/view.md): current view controller
- [ctx.modal](/runjs/context/modal.md): modal APIs

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/element__example-1.md`) - Extracted example from ctx.element
- **❌ Not recommended: direct ctx.element use Example** (`runjs/context/element__example-2.md`) - Extracted example from ctx.element
- **✅ Recommended: ctx.render() Example** (`runjs/context/element__example-3.md`) - Extracted example from ctx.element
- **✅ Recommended: ctx.render() Example** (`runjs/context/element__example-4.md`) - Extracted example from ctx.element

<!-- docs:splits:end -->
