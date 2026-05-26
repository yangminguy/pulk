---
title: "Branch by path Example"
description: "Extracted example from ctx.location"
---

# ctx.location

## Branch by path

```ts
if (ctx.location.pathname.startsWith('/admin/users')) {
  ctx.message.info('On user management page');
}
```
