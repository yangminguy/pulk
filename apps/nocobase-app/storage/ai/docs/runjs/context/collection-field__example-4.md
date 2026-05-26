---
title: "Get enum options Example"
description: "Extracted example from ctx.collectionField"
---

# ctx.collectionField

## Get enum options

```ts
const options = ctx.collectionField?.enum ?? [];
const labels = options.map((o) => (typeof o === 'object' ? o.label : o));
```
