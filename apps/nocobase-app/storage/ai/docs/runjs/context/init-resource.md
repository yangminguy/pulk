---
title: "ctx.initResource()"
description: "**Initializes** the current context’s resource: if `ctx.resource` does not exist, creates one of the given type and binds it; otherwise uses the existing one. After that you can use `ctx.resource`."
---

# ctx.initResource()

**Initializes** the current context’s resource: if `ctx.resource` does not exist, creates one of the given type and binds it; otherwise uses the existing one. After that you can use `ctx.resource`.

## Use Cases

Typically used only in **JSBlock** (standalone block). Most blocks and popups already have `ctx.resource`; JSBlock does not, so call `ctx.initResource(type)` first, then use `ctx.resource`.

## Relation to ctx.makeResource()

| Method | Behavior |
|--------|----------|
| `ctx.initResource(type)` | Creates and binds if `ctx.resource` is missing; otherwise returns existing. Ensures `ctx.resource` is set |
| `ctx.makeResource(type)` | Creates a new instance and returns it; **does not** set `ctx.resource`. Use when you need multiple resources or a temporary one |

## Examples

## Notes

- In most blocks (form, table, detail, etc.) and popups, `ctx.resource` is already bound; no need to call `ctx.initResource`.
- Only in contexts like JSBlock that have no resource by default do you need to initialize.
- After init, call `setResourceName(name)` and then `refresh()` to load data.

## Related

- [ctx.resource](/runjs/context/resource.md): resource in current context
- [ctx.makeResource()](/runjs/context/make-resource.md): create resource without binding to `ctx.resource`
- [MultiRecordResource](/runjs/resource/multi-record-resource.md)
- [SingleRecordResource](/runjs/resource/single-record-resource.md)
- [APIResource](/runjs/resource/api-resource.md)
- [SQLResource](/runjs/resource/sql-resource.md)

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/init-resource__example-1.md`) - Extracted example from ctx.initResource()
- **List data (MultiRecordResource) Example** (`runjs/context/init-resource__example-2.md`) - Extracted example from ctx.initResource()
- **Single record (SingleRecordResource) Example** (`runjs/context/init-resource__example-3.md`) - Extracted example from ctx.initResource()
- **Specify data source Example** (`runjs/context/init-resource__example-4.md`) - Extracted example from ctx.initResource()

<!-- docs:splits:end -->
