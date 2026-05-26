---
title: "Two-way binding (React useEffect + cleanup) Example"
description: "Extracted example from ctx.on()"
---

# ctx.on()

## Two-way binding (React useEffect + cleanup)

```tsx
React.useEffect(() => {
  const handler = (ev) => setValue(ev?.detail ?? '');
  ctx.on?.('js-field:value-change', handler);
  return () => {
    ctx.off?.('js-field:value-change', handler);
  };
}, []);
```
