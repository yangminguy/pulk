---
title: "Two-way binding with getValue Example"
description: "Extracted example from ctx.setValue()"
---

# ctx.setValue()

## Two-way binding with getValue

```tsx
const { Input } = ctx.libs.antd;

const defaultValue = ctx.getValue() ?? '';

ctx.render(
  <Input
    defaultValue={defaultValue}
    onChange={(e) => ctx.setValue(e.target.value)}
  />
);
```
