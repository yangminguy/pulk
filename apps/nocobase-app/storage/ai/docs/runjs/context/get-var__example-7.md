---
title: "Default value Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Default value

```ts
const userName = (await ctx.getVar('ctx.user.nickname')) ?? 'Guest';
```
