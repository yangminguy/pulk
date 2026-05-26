---
title: "Update block/action state Example"
description: "Extracted example from ctx.model"
---

# ctx.model

## Update block/action state

```ts
ctx.model.setProps({ loading: true });
await doSomething();
ctx.model.setProps({ loading: false });
```
