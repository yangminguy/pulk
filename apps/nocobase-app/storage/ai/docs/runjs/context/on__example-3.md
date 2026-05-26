---
title: "Native DOM when ctx.on not available Example"
description: "Extracted example from ctx.on()"
---

# ctx.on()

## Native DOM when ctx.on not available

```ts
const handler = (ev) => {
  if (selectEl) selectEl.value = String(ev?.detail ?? '');
};
ctx.element?.addEventListener('js-field:value-change', handler);
// Cleanup: ctx.element?.removeEventListener('js-field:value-change', handler);
```
