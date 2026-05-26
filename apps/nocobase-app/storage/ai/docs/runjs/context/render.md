---
title: "ctx.render()"
description: "Renders a React element, HTML string, or DOM node into a container. Without `container`, renders into `ctx.element` and inherits the app’s ConfigProvider, theme, etc."
---

# ctx.render()

Renders a React element, HTML string, or DOM node into a container. Without `container`, renders into `ctx.element` and inherits the app’s ConfigProvider, theme, etc.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | Custom block content (charts, lists, cards, etc.) |
| **JSField / JSItem / JSColumn** | Custom editable field or table column |
| **Detail block** | Custom detail field display |

> Note: `ctx.render()` needs a container. If you don’t pass `container` and `ctx.element` is missing (e.g. no-UI logic), an error is thrown.

## vnode types

| Type | Behavior |
|------|----------|
| `React.ReactElement` (JSX) | Rendered with React `createRoot`; full React; inherits app context |
| `string` | Sanitized with DOMPurify and set as container `innerHTML`; existing React root is unmounted first |
| `Node` (Element, Text, etc.) | Container cleared then `appendChild`; existing React root unmounted first |
| `DocumentFragment` | Fragment children appended to container; existing React root unmounted first |

## Examples

## Notes

- **Each call replaces**: Content is replaced, not appended.
- **HTML safety**: HTML is sanitized with DOMPurify; still avoid concatenating untrusted user input.
- **Don’t touch ctx.element directly**: `ctx.element.innerHTML` is deprecated; use `ctx.render()`.
- **No container**: When `ctx.element` is `undefined` (e.g. inside a module loaded by `ctx.importAsync`), pass `container` explicitly.

## Related

- [ctx.element](/runjs/context/element.md): default container when `container` is not passed
- [ctx.libs](/runjs/context/libs.md): React, antd, etc. for JSX
- [ctx.importAsync()](/runjs/context/import-async.md): load external React/components then use with `ctx.render()`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/render__example-1.md`) - Extracted example from ctx.render()
- **React (JSX) Example** (`runjs/context/render__example-2.md`) - Extracted example from ctx.render()
- **HTML string Example** (`runjs/context/render__example-3.md`) - Extracted example from ctx.render()
- **DOM node Example** (`runjs/context/render__example-4.md`) - Extracted example from ctx.render()
- **Custom container Example** (`runjs/context/render__example-5.md`) - Extracted example from ctx.render()
- **Multiple calls replace content Example** (`runjs/context/render__example-6.md`) - Extracted example from ctx.render()

<!-- docs:splits:end -->
