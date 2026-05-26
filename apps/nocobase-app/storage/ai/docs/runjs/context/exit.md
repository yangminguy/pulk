---
title: "ctx.exit()"
description: "Stops the current event flow; later steps in that flow do not run. Often used when business conditions fail, the user cancels, or an unrecoverable error occurs."
---

# ctx.exit()

Stops the current event flow; later steps in that flow do not run. Often used when business conditions fail, the user cancels, or an unrecoverable error occurs.

## Use Cases

`ctx.exit()` is used in contexts that execute JS, such as:

| Scenario | Description |
|----------|-------------|
| **Event flow** | In flows triggered by form submit, button click, etc., stop when conditions are not met |
| **Linkage rules** | Field or filter linkage; stop when validation fails or execution should be skipped |
| **Action events** | In custom actions (e.g. delete confirm, pre-save validation), exit when user cancels or validation fails |

> Difference from `ctx.exitAll()`: `ctx.exit()` only stops the **current** event flow; other flows for the same event still run. `ctx.exitAll()` also stops **subsequent** flows for that event.

## Comparison with ctx.exitAll()

| Method | Scope |
|--------|--------|
| `ctx.exit()` | Stops only the current event flow; others unaffected |
| `ctx.exitAll()` | Stops the current flow and **subsequent** flows for the same event |

## Examples

## Notes

- After `ctx.exit()`, the rest of the current JS does not run; use `ctx.message`, `ctx.notification`, or a dialog before calling to explain why.
- You usually do not need to catch `FlowExitException`; the event flow engine handles it.
- To stop all subsequent flows for the same event, use `ctx.exitAll()`.

## Related

- [ctx.exitAll()](/runjs/context/exit-all.md): stop current and subsequent flows for the event
- [ctx.message](/runjs/context/message.md): message API
- [ctx.modal](/runjs/context/modal.md): confirm dialog

<!-- docs:splits:start -->

## Extracted references

- **Type Example** (`runjs/context/exit__example-1.md`) - Extracted example from ctx.exit()
- **Exit on user cancel Example** (`runjs/context/exit__example-2.md`) - Extracted example from ctx.exit()
- **Exit on validation failure Example** (`runjs/context/exit__example-3.md`) - Extracted example from ctx.exit()
- **Exit when business condition fails Example** (`runjs/context/exit__example-4.md`) - Extracted example from ctx.exit()
- **When to use ctx.exit() vs ctx.exitAll() Example** (`runjs/context/exit__example-5.md`) - Extracted example from ctx.exit()
- **Exit after modal confirm Example** (`runjs/context/exit__example-6.md`) - Extracted example from ctx.exit()

<!-- docs:splits:end -->
