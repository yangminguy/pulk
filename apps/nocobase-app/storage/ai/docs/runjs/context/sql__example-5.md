---
title: "Template variables Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Template variables

```js
ctx.defineProperty('minId', { get: () => 1 });

const rows = await ctx.sql.run(
  'SELECT * FROM users WHERE id > {{ctx.minId}}',
  { type: 'selectRows' }
);
```
