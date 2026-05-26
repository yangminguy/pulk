---
title: "Read state from navigation Example"
description: "Extracted example from ctx.location"
---

# ctx.location

## Read state from navigation

```ts
const prevState = ctx.location.state;
if (prevState?.from === 'dashboard') {
  ctx.message.info('Navigated from dashboard');
}
```
