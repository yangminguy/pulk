---
title: "Type Example"
description: "Extracted example from ctx.filterManager"
---

# ctx.filterManager

## Type

```ts
filterManager: FilterManager;

type FilterConfig = {
  filterId: string;
  targetId: string;
  filterPaths?: string[];
  operator?: string;
};

type ConnectFieldsConfig = {
  targets: { targetId: string; filterPaths: string[] }[];
};
```
