---
title: "Array field items Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Array field items

```ts
const roleNames = await ctx.getVar('ctx.user.roles.name');
// e.g. ['admin', 'member']
```
