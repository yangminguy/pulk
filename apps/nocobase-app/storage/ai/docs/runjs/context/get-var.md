---
title: "ctx.getVar()"
description: "**Asynchronously** reads a variable from the current runtime context. Variable sources are the same as for SQL and template `{{ctx.xxx}}`: current user, current record, view params, popup context, etc."
---

# ctx.getVar()

**Asynchronously** reads a variable from the current runtime context. Variable sources are the same as for SQL and template `{{ctx.xxx}}`: current user, current record, view params, popup context, etc.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSBlock / JSField** | Get current record, user, resource, etc. for rendering or logic |
| **Linkage / event flow** | Read `ctx.record`, `ctx.formValues`, etc. for conditions |
| **Formulas / templates** | Same variable resolution as `{{ctx.xxx}}` |

## Common paths

| Path | Description |
|------|-------------|
| `ctx.record` | Current record (when form/detail is bound to a record) |
| `ctx.record.id` | Current record primary key |
| `ctx.formValues` | Current form values (common in linkage/event flow; in form context prefer `ctx.form.getFieldsValue()` for live values) |
| `ctx.user` | Current user |
| `ctx.user.id` | Current user id |
| `ctx.user.nickname` | Current user nickname |
| `ctx.user.roles.name` | Current user role names (array) |
| `ctx.popup.record` | Record in popup |
| `ctx.popup.record.id` | Popup record primary key |
| `ctx.urlSearchParams` | URL query params (from `?key=value`) |
| `ctx.token` | Current API token |
| `ctx.role` | Current role |

## ctx.getVarInfos()

Returns **structure info** (type, title, child properties, etc.) for variables that can be resolved in the current context. Useful to discover available paths. Values are static meta, not runtime values.

### Options

| Option | Type | Description |
|--------|------|-------------|
| `path` | `string \| string[]` | Limit to paths under this; e.g. `'record'`, `'record.id'`, `'ctx.record'`, `'{{ ctx.record }}'`; array = multiple paths merged |
| `maxDepth` | `number` | Max depth to expand; default `3`. Without path, top-level depth=1; with path, that node depth=1 |

## Relation to ctx.getValue

| Method | Context | Description |
|--------|---------|-------------|
| `ctx.getValue()` | JSField, JSItem, etc. | Sync; **current field** value; requires form binding |
| `ctx.getVar(path)` | Any RunJS | Async; **any ctx variable**; path must start with `ctx.` |

In JSField, use getValue/setValue for the field; use getVar for other context (record, user, formValues).

## Notes

- **Path must start with `ctx.`**: e.g. `ctx.record.id`; otherwise an error is thrown.
- **Async**: Use `await`, e.g. `const id = await ctx.getVar('ctx.record.id')`.
- **Missing variable**: Returns `undefined`; use `??` for default: `(await ctx.getVar('ctx.user.nickname')) ?? 'Guest'`.
- **Form values**: Get via `await ctx.getVar('ctx.formValues')`; not exposed as `ctx.formValues`. In form context prefer `ctx.form.getFieldsValue()` for latest values.

## Examples

## Related

- [ctx.getValue()](/runjs/context/get-value.md): sync current field value (JSField/JSItem only)
- [ctx.form](/runjs/context/form.md): form instance; `ctx.form.getFieldsValue()` for live form values
- [ctx.model](/runjs/context/model.md): current model
- [ctx.blockModel](/runjs/context/block-model.md): parent block
- [ctx.resource](/runjs/context/resource.md): resource in current context
- SQL / template `{{ctx.xxx}}`: same resolution as `ctx.getVar('ctx.xxx')`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/get-var__example-1.md`) - Extracted example from ctx.getVar()
- **Type Example** (`runjs/context/get-var__example-2.md`) - Extracted example from ctx.getVar()
- **Example Example** (`runjs/context/get-var__example-3.md`) - Extracted example from ctx.getVar()
- **Current record id Example** (`runjs/context/get-var__example-4.md`) - Extracted example from ctx.getVar()
- **Popup record Example** (`runjs/context/get-var__example-5.md`) - Extracted example from ctx.getVar()
- **Array field items Example** (`runjs/context/get-var__example-6.md`) - Extracted example from ctx.getVar()
- **Default value Example** (`runjs/context/get-var__example-7.md`) - Extracted example from ctx.getVar()
- **Form field value Example** (`runjs/context/get-var__example-8.md`) - Extracted example from ctx.getVar()
- **URL query params Example** (`runjs/context/get-var__example-9.md`) - Extracted example from ctx.getVar()
- **Explore variables Example** (`runjs/context/get-var__example-10.md`) - Extracted example from ctx.getVar()

<!-- docs:splits:end -->
