---
title: "ctx.form"
description: "The Ant Design Form instance for the current block; used to read/write form fields, trigger validation, and submit. Same as `ctx.blockModel?.form`; in form blocks (Form, EditForm, sub-forms, etc.) you can use it directly."
---

# ctx.form

The Ant Design Form instance for the current block; used to read/write form fields, trigger validation, and submit. Same as `ctx.blockModel?.form`; in form blocks (Form, EditForm, sub-forms, etc.) you can use it directly.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSField** | Read/write other fields for linkage, compute or validate from other field values |
| **JSItem** | Read/write same row or other fields in sub-table items |
| **JSColumn** | Read row or related field values for column rendering |
| **Form actions / event flow** | Pre-submit validation, batch field updates, reset form, etc. |

> Note: `ctx.form` is only available in RunJS contexts tied to a form block (Form, EditForm, sub-forms, etc.); in non-form contexts (e.g. standalone JSBlock, table block) it may be absent—check before use: `ctx.form?.getFieldsValue()`.

## Common Methods

## Relation to Other Context

### ctx.getValue / ctx.setValue

| Scenario | Recommended |
|----------|-------------|
| **Current field** | `ctx.getValue()` / `ctx.setValue(v)` |
| **Other fields** | `ctx.form.getFieldValue(name)` / `ctx.form.setFieldValue(name, v)` |

In the current JS field, use `getValue`/`setValue` for that field; use `ctx.form` for other fields.

### ctx.blockModel

| Need | Recommended |
|------|-------------|
| **Read/write form fields** | `ctx.form` (same as `ctx.blockModel?.form`) |
| **Parent block** | `ctx.blockModel` (includes `collection`, `resource`, etc.) |

### ctx.getVar('ctx.formValues')

Form values are obtained via `await ctx.getVar('ctx.formValues')`, not as `ctx.formValues`. In form contexts, prefer `ctx.form.getFieldsValue()` for up-to-date values.

## Notes

- `getFieldsValue()` by default returns only rendered fields; for unrendered (e.g. collapsed) use `getFieldsValue(true)`.
- Nested paths use arrays, e.g. `['orders', 0, 'amount']`; you can use `ctx.namePath` to build paths for other columns in the same row.
- `validateFields()` throws with `errorFields` etc. on failure; use `ctx.exit()` to stop further steps when validation fails.
- In event flow or linkage, `ctx.form` may not be ready yet; use optional chaining or null checks.

## Examples

## Related

- [ctx.getValue()](/runjs/context/get-value.md) / [ctx.setValue()](/runjs/context/set-value.md): read/write current field
- [ctx.blockModel](/runjs/context/block-model.md): parent block; `ctx.form` is `ctx.blockModel?.form`
- [ctx.modal](/runjs/context/modal.md): confirm dialog, often with `ctx.form.validateFields()` / `ctx.form.submit()`
- [ctx.exit()](/runjs/context/exit.md): stop flow on validation failure or cancel
- `ctx.namePath`: current field path in the form (array); use for nested `getFieldValue` / `setFieldValue` names

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/form__example-1.md`) - Extracted example from ctx.form
- **Read form values Example** (`runjs/context/form__example-2.md`) - Extracted example from ctx.form
- **Write form values Example** (`runjs/context/form__example-3.md`) - Extracted example from ctx.form
- **Validation and submit Example** (`runjs/context/form__example-4.md`) - Extracted example from ctx.form
- **Reset Example** (`runjs/context/form__example-5.md`) - Extracted example from ctx.form
- **Field linkage by type Example** (`runjs/context/form__example-6.md`) - Extracted example from ctx.form
- **Compute current field from others Example** (`runjs/context/form__example-7.md`) - Extracted example from ctx.form
- **Same row in sub-table Example** (`runjs/context/form__example-8.md`) - Extracted example from ctx.form
- **Pre-submit validation Example** (`runjs/context/form__example-9.md`) - Extracted example from ctx.form
- **Confirm then submit Example** (`runjs/context/form__example-10.md`) - Extracted example from ctx.form

<!-- docs:splits:end -->
