---
title: "Pass state Example"
description: "Extracted example from ctx.router"
---

# ctx.router

## Pass state

```ts
ctx.router.navigate('/admin/users/123', { 
  state: { from: 'dashboard', tab: 'profile' } 
});
```
