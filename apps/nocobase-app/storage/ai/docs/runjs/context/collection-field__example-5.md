---
title: "Conditional render by readonly Example"
description: "Extracted example from ctx.collectionField"
---

# ctx.collectionField

## Conditional render by readonly

```ts
const { Input } = ctx.libs.antd;
if (ctx.collectionField?.readonly) {
  ctx.render(<span>{ctx.getValue?.() ?? '-'}</span>);
} else {
  ctx.render(<Input onChange={(e) => ctx.setValue?.(e.target.value)} />);
}
```
