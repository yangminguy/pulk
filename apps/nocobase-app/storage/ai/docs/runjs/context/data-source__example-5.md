---
title: "Validation or dynamic UI from field metadata Example"
description: "Extracted example from ctx.dataSource"
---

# ctx.dataSource

## Validation or dynamic UI from field metadata

```ts
const field = ctx.dataSource.getCollectionField('users.status');
if (field) {
  const options = field.enum ?? [];
  const operators = field.getFilterOperators();
  // ...
}
```
