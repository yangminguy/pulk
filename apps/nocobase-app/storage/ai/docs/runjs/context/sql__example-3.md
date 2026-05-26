---
title: "Parameter binding Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Parameter binding

```js
const users = await ctx.sql.run(
  'SELECT * FROM users WHERE status = $status AND age > $minAge',
  { bind: { status: 'active', minAge: 18 }, type: 'selectRows' }
);
```
