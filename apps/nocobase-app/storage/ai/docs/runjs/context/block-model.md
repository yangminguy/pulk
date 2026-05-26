---
title: "ctx.blockModel"
description: "The parent block model (BlockModel instance) that hosts the current JS field / JS block. In JSField, JSItem, JSColumn, etc., `ctx.blockModel` refers to the form block or table block that hosts the current JS logic; in a standalone JSBlock it may be `null` or the same as `ctx.model`."
---

# ctx.blockModel

The parent block model (BlockModel instance) that hosts the current JS field / JS block. In JSField, JSItem, JSColumn, etc., `ctx.blockModel` refers to the form block or table block that hosts the current JS logic; in a standalone JSBlock it may be `null` or the same as `ctx.model`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSField** | Access parent form block's `form`, `collection`, `resource` for linkage or validation |
| **JSItem** | Access parent table/form block's resource and collection in sub-table items |
| **JSColumn** | Access parent table block's `resource` (e.g. `getSelectedRows`), `collection` |
| **Form actions / event flow** | Use `form` for pre-submit validation, `resource` for refresh, etc. |

> Note: `ctx.blockModel` is only available in RunJS contexts that have a parent block; in a standalone JSBlock (no parent form/table) it may be `null`—check before use.

## Common Properties

| Property | Type | Description |
|----------|------|-------------|
| `uid` | `string` | Block model unique id |
| `collection` | `Collection` | Collection bound to the block |
| `resource` | `Resource` | Resource instance (`SingleRecordResource` / `MultiRecordResource`, etc.) |
| `form` | `FormInstance` | Form block: Ant Design Form instance (`getFieldsValue`, `validateFields`, `setFieldsValue`, etc.) |
| `emitter` | `EventEmitter` | Event emitter; can listen to `formValuesChange`, `onFieldReset`, etc. |

## Relation to ctx.model, ctx.form

| Need | Recommended |
|------|-------------|
| **Parent block of current JS** | `ctx.blockModel` |
| **Read/write form fields** | `ctx.form` (same as `ctx.blockModel?.form`; more convenient in form blocks) |
| **Model for current execution context** | `ctx.model` (field model in JSField, block model in JSBlock) |

In JSField, `ctx.model` is the field model and `ctx.blockModel` is the form/table block that hosts it; `ctx.form` is usually `ctx.blockModel.form`.

## Examples

## Notes

- In a **standalone JSBlock** (no parent form/table), `ctx.blockModel` may be `null`; use optional chaining: `ctx.blockModel?.resource?.refresh?.()`.
- In **JSField / JSItem / JSColumn**, `ctx.blockModel` is the form or table block that hosts the field; in **JSBlock**, it may be the block itself or an ancestor, depending on hierarchy.
- `resource` exists only on data blocks; `form` exists only on form blocks; table blocks usually have no `form`.

## Related

- [ctx.model](/runjs/context/model.md): model for current execution context
- [ctx.form](/runjs/context/form.md): form instance, common in form blocks
- [ctx.resource](/runjs/context/resource.md): resource instance (same as `ctx.blockModel?.resource` when present)
- [ctx.getModel()](/runjs/context/get-model.md): get another block model by uid

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/block-model__example-1.md`) - Extracted example from ctx.blockModel
- **Table: get selected rows and process Example** (`runjs/context/block-model__example-2.md`) - Extracted example from ctx.blockModel
- **Form: validate and refresh Example** (`runjs/context/block-model__example-3.md`) - Extracted example from ctx.blockModel
- **Listen to form changes Example** (`runjs/context/block-model__example-4.md`) - Extracted example from ctx.blockModel
- **Trigger block re-render Example** (`runjs/context/block-model__example-5.md`) - Extracted example from ctx.blockModel

<!-- docs:splits:end -->
