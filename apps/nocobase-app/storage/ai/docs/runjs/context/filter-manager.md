---
title: "ctx.filterManager"
description: "The filter connection manager that links filter forms (FilterForm) to data blocks (tables, lists, charts, etc.). Provided by `BlockGridModel`; only available in that context (e.g. pages with a filter form block)."
---

# ctx.filterManager

The filter connection manager that links filter forms (FilterForm) to data blocks (tables, lists, charts, etc.). Provided by `BlockGridModel`; only available in that context (e.g. pages with a filter form block).

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Filter form block** | Manage connections between filter items and target blocks; refresh targets when filters change |
| **Data block (table/list)** | Act as filter target; bind filter conditions via `bindToTarget` |
| **Linkage / custom FilterModel** | In `doFilter`, `doReset`, call `refreshTargetsByFilter` to refresh targets |
| **Connection field config** | Use `getConnectFieldsConfig`, `saveConnectFieldsConfig` for filter–target field mapping |

> Note: `ctx.filterManager` is only available in RunJS contexts that have a `BlockGridModel` (e.g. pages with a filter form); in a plain JSBlock or standalone page it is `undefined`—check before use.

## Common Methods

| Method | Description |
|--------|-------------|
| `getFilterConfigs()` | All filter connection configs |
| `getConnectFieldsConfig(filterId)` | Connection field config for a filter |
| `saveConnectFieldsConfig(filterId, config)` | Save connection field config for a filter |
| `addFilterConfig(config)` | Add filter config (filterId + targetId + filterPaths) |
| `removeFilterConfig({ filterId?, targetId?, persist? })` | Remove config by filterId and/or targetId |
| `bindToTarget(targetId)` | Bind filter to target block; its resource applies the filter |
| `unbindFromTarget(targetId)` | Unbind filter from target |
| `refreshTargetsByFilter(filterId or filterId[])` | Refresh target block(s) by filter |

## Concepts

- **FilterModel**: Provides filter values (e.g. FilterFormItemModel); must implement `getFilterValue()`.
- **TargetModel**: Data block being filtered; its `resource` must support `addFilterGroup`, `removeFilterGroup`, `refresh`.

## Examples

## Related

- [ctx.resource](/runjs/context/resource.md): target block’s resource must support filter APIs
- [ctx.model](/runjs/context/model.md): current model uid for filterId / targetId

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/filter-manager__example-1.md`) - Extracted example from ctx.filterManager
- **Add filter config Example** (`runjs/context/filter-manager__example-2.md`) - Extracted example from ctx.filterManager
- **Refresh target blocks Example** (`runjs/context/filter-manager__example-3.md`) - Extracted example from ctx.filterManager
- **Connection field config Example** (`runjs/context/filter-manager__example-4.md`) - Extracted example from ctx.filterManager
- **Remove config Example** (`runjs/context/filter-manager__example-5.md`) - Extracted example from ctx.filterManager

<!-- docs:splits:end -->
