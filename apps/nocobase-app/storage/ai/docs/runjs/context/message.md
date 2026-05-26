---
title: "ctx.message"
description: "Ant Design global message API; shows short messages at the top center. Messages auto-close after a while or can be closed by the user."
---

# ctx.message

Ant Design global message API; shows short messages at the top center. Messages auto-close after a while or can be closed by the user.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField / JSItem / JSColumn** | Quick feedback: validation, copy success, etc. |
| **Form actions / event flow** | Submit success, save failed, validation failed |
| **JSAction** | Click or batch action feedback |

## Examples

## ctx.message vs ctx.notification

| | ctx.message | ctx.notification |
|---|-------------|-------------------|
| **Position** | Top center | Top right |
| **Use** | Short, auto-dismiss | Panel with title/description; can stay longer |
| **Typical** | Action feedback, validation, copy | Task done, system notice, longer content |

## Related

- [ctx.notification](/runjs/context/notification.md): top-right notifications
- [ctx.modal](/runjs/context/modal.md): modal confirm
- [ctx.t()](/runjs/context/t.md): i18n; often used with message

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/message__example-1.md`) - Extracted example from ctx.message
- **Common Methods Example** (`runjs/context/message__example-2.md`) - Extracted example from ctx.message
- **Basic Example** (`runjs/context/message__example-3.md`) - Extracted example from ctx.message
- **With ctx.t (i18n) Example** (`runjs/context/message__example-4.md`) - Extracted example from ctx.message
- **Loading and manual close Example** (`runjs/context/message__example-5.md`) - Extracted example from ctx.message
- **open with config Example** (`runjs/context/message__example-6.md`) - Extracted example from ctx.message
- **Close all Example** (`runjs/context/message__example-7.md`) - Extracted example from ctx.message

<!-- docs:splits:end -->
