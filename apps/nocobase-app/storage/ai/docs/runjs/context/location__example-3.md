---
title: "Parse query params Example"
description: "Extracted example from ctx.location"
---

# ctx.location

## Parse query params

```ts
const page = ctx.urlSearchParams.page || 1;
const status = ctx.urlSearchParams.status;

const params = new URLSearchParams(ctx.location.search);
const page = params.get('page') || '1';
const status = params.get('status');
```
