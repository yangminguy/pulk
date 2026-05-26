---
title: "ctx.modal"
description: "Shortcut API built on Ant Design Modal for opening modals (info, confirm, etc.) from RunJS. Implemented by `ctx.viewer` / the view system."
---

# ctx.modal

Shortcut API built on Ant Design Modal for opening modals (info, confirm, etc.) from RunJS. Implemented by `ctx.viewer` / the view system.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField** | Show result, error, or confirmation after user action |
| **Event flow / action events** | Confirm before submit; use `ctx.exit()` when user cancels |
| **Linkage** | Show modal when validation fails |

> Note: `ctx.modal` is available in RunJS when a view context exists (e.g. JSBlock on a page, event flow); in backend or no-UI contexts it may be absent—use optional chaining: `ctx.modal?.confirm?.()`.

## Common Methods

| Method | Returns | Description |
|--------|--------|-------------|
| `info(config)` | `Promise<void>` | Info modal |
| `success(config)` | `Promise<void>` | Success modal |
| `error(config)` | `Promise<void>` | Error modal |
| `warning(config)` | `Promise<void>` | Warning modal |
| `confirm(config)` | `Promise<boolean>` | Confirm; OK → `true`, Cancel → `false` |

## Config

Same as Ant Design `Modal`; common fields:

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `ReactNode` | Title |
| `content` | `ReactNode` | Content |
| `okText` | `string` | OK button text |
| `cancelText` | `string` | Cancel button text (`confirm` only) |
| `onOk` | `() => void \| Promise<void>` | On OK click |
| `onCancel` | `() => void` | On Cancel click |

## Relation to ctx.message, ctx.openView

| Use | Recommended |
|-----|-------------|
| **Short auto-dismiss** | `ctx.message` |
| **Info/success/error/warning modal** | `ctx.modal.info` / `success` / `error` / `warning` |
| **Confirm (user choice)** | `ctx.modal.confirm`; use `ctx.exit()` to control flow |
| **Complex form, list, etc.** | `ctx.openView` for custom view (page/drawer/dialog) |

## Examples

## Related

- [ctx.message](/runjs/context/message.md): short auto-dismiss messages
- [ctx.exit()](/runjs/context/exit.md): when user cancels confirm, use `if (!confirmed) ctx.exit()`
- [ctx.openView()](/runjs/context/open-view.md): open custom view for complex flows

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/modal__example-1.md`) - Extracted example from ctx.modal
- **Simple info Example** (`runjs/context/modal__example-2.md`) - Extracted example from ctx.modal
- **Confirm and control flow Example** (`runjs/context/modal__example-3.md`) - Extracted example from ctx.modal
- **Confirm with onOk Example** (`runjs/context/modal__example-4.md`) - Extracted example from ctx.modal
- **Error Example** (`runjs/context/modal__example-5.md`) - Extracted example from ctx.modal

<!-- docs:splits:end -->
