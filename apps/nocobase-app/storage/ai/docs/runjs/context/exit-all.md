---
title: "ctx.exitAll()"
description: "Stops the current event flow and all **subsequent** event flows that were triggered in the same event dispatch. Use when a global error or permission check requires stopping every flow for that event."
---

# ctx.exitAll()

Stops the current event flow and all **subsequent** event flows that were triggered in the same event dispatch. Use when a global error or permission check requires stopping every flow for that event.

## Use Cases

Use `ctx.exitAll()` in JS-capable contexts when you need to **stop both the current flow and any later flows for the same event**:

| Scenario | Description |
|----------|-------------|
| **Event flow** | Main flow fails (e.g. no permission); stop it and any subsequent flows for that event |
| **Linkage rules** | When linkage validation fails and you want to stop current and subsequent linkage |
| **Action events** | Pre-action check fails (e.g. delete permission); block the action and later steps |

> Difference from `ctx.exit()`: `ctx.exit()` only stops the current flow; `ctx.exitAll()` also stops **subsequent** flows for that event.

## Comparison with ctx.exit()

| Method | Scope |
|--------|--------|
| `ctx.exit()` | Stops only the current flow; later flows still run |
| `ctx.exitAll()` | Stops the current flow and **subsequent** flows for the same event |

## Execution mode

- **Sequential**: flows for the same event run one after another; after any flow calls `ctx.exitAll()`, later flows do not run.
- **Parallel**: flows run in parallel; one flow calling `ctx.exitAll()` does not stop other already-running flows.

## Examples

## Notes

- After `ctx.exitAll()`, the rest of the current JS does not run; explain to the user with `ctx.message`, `ctx.notification`, or a dialog before calling.
- You usually do not need to catch `FlowExitAllException`; the engine handles it.
- To stop only the current flow, use `ctx.exit()`.
- In parallel mode, `ctx.exitAll()` only stops the current flow; it does not cancel other concurrent flows.

## Related

- [ctx.exit()](/runjs/context/exit.md): stop only the current flow
- [ctx.message](/runjs/context/message.md): message API
- [ctx.modal](/runjs/context/modal.md): confirm dialog

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/exit-all__example-1.md`) - Extracted example from ctx.exitAll()
- **Stop all flows on permission failure Example** (`runjs/context/exit-all__example-2.md`) - Extracted example from ctx.exitAll()
- **Stop on global pre-check failure Example** (`runjs/context/exit-all__example-3.md`) - Extracted example from ctx.exitAll()
- **When to use ctx.exit() vs ctx.exitAll() Example** (`runjs/context/exit-all__example-4.md`) - Extracted example from ctx.exitAll()
- **Message then exit Example** (`runjs/context/exit-all__example-5.md`) - Extracted example from ctx.exitAll()

<!-- docs:splits:end -->
