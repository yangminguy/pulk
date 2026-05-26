---
title: "ctx.notification"
description: "Global notification API based on Ant Design Notification; shows notifications in the **top-right**. Compared to `ctx.message`, notifications can have title and description and stay longer."
---

# ctx.notification

Global notification API based on Ant Design Notification; shows notifications in the **top-right**. Compared to `ctx.message`, notifications can have title and description and stay longer.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / action events** | Task done, batch result, export done |
| **Event flow** | System notice after async flow ends |
| **Longer content** | Full notification with title, description, actions |

## Common Methods

| Method | Description |
|--------|-------------|
| `open(config)` | Open with custom config |
| `success(config)` | Success notification |
| `info(config)` | Info notification |
| `warning(config)` | Warning notification |
| `error(config)` | Error notification |
| `destroy(key?)` | Close notification by key; no key = close all |

**Config** (same as [Ant Design notification](https://ant.design/components/notification)):

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `ReactNode` | Title |
| `description` | `ReactNode` | Description |
| `duration` | `number` | Auto-close seconds; default 4.5; 0 = no auto-close |
| `key` | `string` | Unique id for `destroy(key)` |
| `onClose` | `() => void` | On close |
| `placement` | `string` | `topLeft` \| `topRight` \| `bottomLeft` \| `bottomRight` |

## Examples

## ctx.message vs ctx.notification

| | ctx.message | ctx.notification |
|---|-------------|-------------------|
| **Position** | Top center | Top right (configurable) |
| **Structure** | Single line | Title + description |
| **Use** | Short, auto-dismiss | Longer, can stay |
| **Typical** | Success, validation, copy | Task done, system notice |

## Related

- [ctx.message](/runjs/context/message.md): top-center short messages
- [ctx.modal](/runjs/context/modal.md): modal confirm
- [ctx.t()](/runjs/context/t.md): i18n; often used with notification

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/notification__example-1.md`) - Extracted example from ctx.notification
- **Basic Example** (`runjs/context/notification__example-2.md`) - Extracted example from ctx.notification
- **By type Example** (`runjs/context/notification__example-3.md`) - Extracted example from ctx.notification
- **Custom duration and key Example** (`runjs/context/notification__example-4.md`) - Extracted example from ctx.notification
- **Close all Example** (`runjs/context/notification__example-5.md`) - Extracted example from ctx.notification

<!-- docs:splits:end -->
