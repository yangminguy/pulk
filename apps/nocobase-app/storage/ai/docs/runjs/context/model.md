---
title: "ctx.model"
description: "The `FlowModel` instance for the current RunJS execution context; the default entry in JSBlock, JSField, JSAction, etc. The concrete type varies: e.g. `BlockModel`, `ActionModel`, `JSEditableFieldModel`."
---

# ctx.model

The `FlowModel` instance for the current RunJS execution context; the default entry in JSBlock, JSField, JSAction, etc. The concrete type varies: e.g. `BlockModel`, `ActionModel`, `JSEditableFieldModel`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock** | `ctx.model` is the block model; access `resource`, `collection`, `setProps`, etc. |
| **JSField / JSItem / JSColumn** | `ctx.model` is the field model; access `setProps`, `dispatchEvent`, etc. |
| **Action events / ActionModel** | `ctx.model` is the action model; read/write step params, dispatch events, etc. |

> Tip: For the **parent block** that hosts the current JS (e.g. form/table block), use `ctx.blockModel`; for **other models** use `ctx.getModel(uid)`.

## Common Properties

| Property | Type | Description |
|----------|------|-------------|
| `uid` | `string` | Model unique id; use with `ctx.getModel(uid)` or popup binding |
| `collection` | `Collection` | Collection bound to the model (when block/field is bound to data) |
| `resource` | `Resource` | Resource instance; refresh, get selected rows, etc. |
| `props` | `object` | UI/behavior config; update with `setProps` |
| `subModels` | `Record<string, FlowModel>` | Child models (e.g. form fields, table columns) |
| `parent` | `FlowModel` | Parent model (if any) |

## Common Methods

| Method | Description |
|--------|-------------|
| `setProps(partialProps: any): void` | Update model config and trigger re-render (e.g. `ctx.model.setProps({ loading: true })`) |
| `dispatchEvent(eventName: string, payload?: any, options?: any): Promise<any[]>` | Dispatch event to the model; runs flows listening for that event. Optional `payload` to handler; `options.debounce` for debounce |
| `getStepParams?.(flowKey, stepKey)` | Read flow step params (settings panel, custom actions, etc.) |
| `setStepParams?.(flowKey, stepKey, params)` | Write flow step params |

## Relation to ctx.blockModel, ctx.getModel

| Need | Recommended |
|------|-------------|
| **Model for current execution context** | `ctx.model` |
| **Parent block of current JS** | `ctx.blockModel`; use for `resource`, `form`, `collection` |
| **Any model by uid** | `ctx.getModel(uid)` or `ctx.getModel(uid, true)` (cross view stack) |

In JSField, `ctx.model` is the field model and `ctx.blockModel` is the form/table block that hosts it.

## Examples

## Related

- [ctx.blockModel](/runjs/context/block-model.md): parent block of current JS
- [ctx.getModel()](/runjs/context/get-model.md): get another model by uid

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/model__example-1.md`) - Extracted example from ctx.model
- **Update block/action state Example** (`runjs/context/model__example-2.md`) - Extracted example from ctx.model
- **Dispatch model event Example** (`runjs/context/model__example-3.md`) - Extracted example from ctx.model
- **Use uid for popup or cross-model Example** (`runjs/context/model__example-4.md`) - Extracted example from ctx.model

<!-- docs:splits:end -->
