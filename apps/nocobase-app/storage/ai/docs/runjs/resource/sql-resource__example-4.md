---
title: "Result types Example"
description: "Extracted example from SQLResource"
---

# SQLResource

## Result types

```js
// Multiple rows (default)
ctx.resource.setSQLType('selectRows');
const rows = ctx.resource.getData(); // [{...}, {...}]

// Single row
ctx.resource.setSQLType('selectRow');
const row = ctx.resource.getData(); // {...}

// Single value (e.g. COUNT)
ctx.resource.setSQLType('selectVar');
const total = ctx.resource.getData(); // 42
```
