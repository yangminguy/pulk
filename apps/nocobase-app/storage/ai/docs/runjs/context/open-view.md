---
title: "ctx.openView()"
description: "Opens a configured view (drawer, dialog, embed, etc.) programmatically. Provided by FlowModelContext; used in JSBlock, table cells, event flow, etc. to open ChildPage or PopupAction views."
---

# ctx.openView()

Opens a configured view (drawer, dialog, embed, etc.) programmatically. Provided by FlowModelContext; used in JSBlock, table cells, event flow, etc. to open ChildPage or PopupAction views.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | Button opens detail/edit dialog; pass current row `filterByTk` |
| **Table cell** | Button in cell opens row detail dialog |
| **Event flow / JSAction** | Open next view or dialog after action success |
| **Association field** | `ctx.runAction('openView', params)` for select/edit dialog |

> Note: `ctx.openView` requires a FlowModel context; if no model exists for the uid, a PopupActionModel is created and persisted.

## Parameters

### uid

Unique id of the view model. If missing, it is created and saved. Use a stable uid (e.g. `${ctx.model.uid}-detail`) so the same popup can be reused.

### options (common fields)

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `drawer` / `dialog` / `embed` | How to open: drawer, dialog, embed; default `drawer` |
| `size` | `small` / `medium` / `large` | Dialog/drawer size; default `medium` |
| `title` | `string` | View title |
| `params` | `Record<string, any>` | Arbitrary params passed to the view |
| `filterByTk` | `any` | Primary key for single-record detail/edit |
| `sourceId` | `string` | Source record id (associations) |
| `dataSourceKey` | `string` | Data source |
| `collectionName` | `string` | Collection name |
| `associationName` | `string` | Association field name |
| `navigation` | `boolean` | Use route navigation; forced `false` when passing `defineProperties` / `defineMethods` |
| `preventClose` | `boolean` | Prevent close |
| `defineProperties` | `Record<string, PropertyOptions>` | Inject properties into view models |
| `defineMethods` | `Record<string, Function>` | Inject methods into view models |

## Examples

## Relation to ctx.viewer, ctx.view

| Use | Recommended |
|-----|-------------|
| **Open configured flow view** | `ctx.openView(uid, options)` |
| **Open custom content (no flow)** | `ctx.viewer.dialog()` / `ctx.viewer.drawer()` |
| **Operate current view** | `ctx.view.close()`, `ctx.view.inputArgs` |

`ctx.openView` opens a FlowPage (ChildPageModel) with a full flow; `ctx.viewer` opens arbitrary React content.

## Notes

- Prefer uids related to `ctx.model.uid` (e.g. `${ctx.model.uid}-xxx`) to avoid conflicts between blocks.
- When passing `defineProperties` / `defineMethods`, `navigation` is forced to `false` so context is not lost on refresh.
- Inside a popup, `ctx.view` is the current view and `ctx.view.inputArgs` holds the params passed when opening.

## Related

- [ctx.view](/runjs/context/view.md): current view instance
- [ctx.model](/runjs/context/model.md): current model; use for stable popupUid

<!-- docs:splits:start -->

## Extracted references

- **Signature Example** (`runjs/context/open-view__example-1.md`) - Extracted example from ctx.openView()
- **Basic: open drawer Example** (`runjs/context/open-view__example-2.md`) - Extracted example from ctx.openView()
- **Pass current row context Example** (`runjs/context/open-view__example-3.md`) - Extracted example from ctx.openView()
- **Open via runAction Example** (`runjs/context/open-view__example-4.md`) - Extracted example from ctx.openView()
- **Inject custom context Example** (`runjs/context/open-view__example-5.md`) - Extracted example from ctx.openView()

<!-- docs:splits:end -->
