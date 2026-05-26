---
title: "ctx.makeResource()"
description: "**Creates** a new resource instance and returns it; **does not** set or change `ctx.resource`. Use when you need multiple resources or a temporary one."
---

# ctx.makeResource()

**Creates** a new resource instance and returns it; **does not** set or change `ctx.resource`. Use when you need multiple resources or a temporary one.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Multiple resources** | Load several data sources (e.g. users + orders), each with its own resource |
| **One-off query** | Single query, no need to bind to `ctx.resource` |
| **Auxiliary data** | Main data in `ctx.resource`, extra data from a `makeResource` instance |

If you only need one resource and want it on `ctx.resource`, use [ctx.initResource()](/runjs/context/init-resource.md).

## Relation to ctx.initResource()

| Method | Behavior |
|--------|----------|
| `ctx.makeResource(type)` | Creates and returns; **does not** set `ctx.resource`; can call multiple times for multiple resources |
| `ctx.initResource(type)` | Creates and binds if missing; otherwise returns existing. Ensures `ctx.resource` is set |

## Examples

## Notes

- Call `setResourceName(name)` then `refresh()` to load data.
- Each instance is independent; good for loading several sources in parallel.

## Related

- [ctx.initResource()](/runjs/context/init-resource.md): init and bind to `ctx.resource`
- [ctx.resource](/runjs/context/resource.md): current context resource
- [MultiRecordResource](/runjs/resource/multi-record-resource.md)
- [SingleRecordResource](/runjs/resource/single-record-resource.md)
- [APIResource](/runjs/resource/api-resource.md)
- [SQLResource](/runjs/resource/sql-resource.md)

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/make-resource__example-1.md`) - Extracted example from ctx.makeResource()
- **Single resource Example** (`runjs/context/make-resource__example-2.md`) - Extracted example from ctx.makeResource()
- **Multiple resources Example** (`runjs/context/make-resource__example-3.md`) - Extracted example from ctx.makeResource()
- **One-off query Example** (`runjs/context/make-resource__example-4.md`) - Extracted example from ctx.makeResource()

<!-- docs:splits:end -->
