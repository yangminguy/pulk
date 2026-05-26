---
title: "ctx.getModel()"
description: "Returns a model instance (e.g. BlockModel, PageModel, ActionModel) from the current engine or view stack by its `uid`. Use in RunJS to access other models across blocks, pages, or popups."
---

# ctx.getModel()

Returns a model instance (e.g. BlockModel, PageModel, ActionModel) from the current engine or view stack by its `uid`. Use in RunJS to access other models across blocks, pages, or popups.

If you only need the model or block for the current execution context, use `ctx.model` or `ctx.blockModel` instead of `ctx.getModel`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSAction** | Get another block’s model by known `uid`; read/write its `resource`, `form`, `setProps`, etc. |
| **RunJS inside popup** | Access a model on the page that opened the popup; pass `searchInPreviousEngines: true` |
| **Custom actions** | Find a form or sub-model in the settings panel across the view stack by `uid` |

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | Unique id of the target model (e.g. from config or creation) |
| `searchInPreviousEngines` | `boolean` | Optional, default `false`. When `true`, search up the view stack from the current engine to find models in parent views (e.g. the page that opened the popup) |

## Return value

- Returns the corresponding `FlowModel` subclass (e.g. `BlockModel`, `FormBlockModel`, `ActionModel`) if found.
- Returns `undefined` if not found.

## Search scope

- **Default (`searchInPreviousEngines: false`)**: Search only in the **current engine** by `uid`. In popups or nested views, each view has its own engine; by default only the current view is searched.
- **`searchInPreviousEngines: true`**: Search from the current engine along the `previousEngine` chain; returns the first match. Use when RunJS in a popup needs to access a model on the page that opened it.

## Examples

## Related

- [ctx.model](/runjs/context/model.md): model for current execution context
- [ctx.blockModel](/runjs/context/block-model.md): parent block of current JS; often no need for `getModel`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/get-model__example-1.md`) - Extracted example from ctx.getModel()
- **Get another block and refresh Example** (`runjs/context/get-model__example-2.md`) - Extracted example from ctx.getModel()
- **Access page model from inside popup Example** (`runjs/context/get-model__example-3.md`) - Extracted example from ctx.getModel()
- **Cross-model update and rerender Example** (`runjs/context/get-model__example-4.md`) - Extracted example from ctx.getModel()
- **Null check Example** (`runjs/context/get-model__example-5.md`) - Extracted example from ctx.getModel()

<!-- docs:splits:end -->
