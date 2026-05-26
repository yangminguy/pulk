---
title: "lodash Example"
description: "Extracted example from ctx.libs"
---

# ctx.libs

## lodash

```ts
const user = { profile: { name: 'Alice' } };
const name = ctx.libs.lodash.get(user, 'profile.name', 'Unknown');
```
