---
title: "ctx.on()"
description: "Subscribe to context events in RunJS (e.g. field value change, property change, resource refresh). Events are mapped to custom DOM events on `ctx.element` or the internal event bus on `ctx.resource`."
---

# ctx.on()

Subscribe to context events in RunJS (e.g. field value change, property change, resource refresh). Events are mapped to custom DOM events on `ctx.element` or the internal event bus on `ctx.resource`.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **JSField / JSEditableField** | Sync UI when field value changes from outside (form, linkage); two-way binding |
| **JSBlock / JSItem / JSColumn** | Listen to custom events on the container; react to data/state changes |
| **resource** | Listen to refresh, save, etc.; run logic after data updates |

## Common Events

| Event | Description | Source |
|-------|-------------|--------|
| `js-field:value-change` | Field value changed from outside (form linkage, default value) | CustomEvent on `ctx.element`; `ev.detail` = new value |
| `resource:refresh` | Resource data refreshed | `ctx.resource` event bus |
| `resource:saved` | Resource save completed | `ctx.resource` event bus |

> Events with `resource:` prefix use `ctx.resource.on`; others typically use DOM events on `ctx.element` when present.

## Examples

## With ctx.off

- Unsubscribe with [ctx.off](/runjs/context/off.md) when appropriate to avoid leaks or duplicate handlers.
- In React, usually call `ctx.off` in `useEffect` cleanup.
- `ctx.off` may not exist; use optional chaining: `ctx.off?.('eventName', handler)`.

## Notes

1. **Pair with off**: Each `ctx.on(eventName, handler)` should have a matching `ctx.off(eventName, handler)` with the same `handler` reference.
2. **Lifecycle**: Remove listeners before unmount or context destroy to avoid leaks.
3. **Event support**: Different context types support different events; see component docs.

## Related

- [ctx.off](/runjs/context/off.md): remove listener
- [ctx.element](/runjs/context/element.md): container and DOM events
- [ctx.resource](/runjs/context/resource.md): resource and its `on`/`off`
- [ctx.setValue](/runjs/context/set-value.md): sets field value; triggers `js-field:value-change`

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/on__example-1.md`) - Extracted example from ctx.on()
- **Two-way binding (React useEffect + cleanup) Example** (`runjs/context/on__example-2.md`) - Extracted example from ctx.on()
- **Native DOM when ctx.on not available Example** (`runjs/context/on__example-3.md`) - Extracted example from ctx.on()
- **Update UI after resource refresh Example** (`runjs/context/on__example-4.md`) - Extracted example from ctx.on()

<!-- docs:splits:end -->
