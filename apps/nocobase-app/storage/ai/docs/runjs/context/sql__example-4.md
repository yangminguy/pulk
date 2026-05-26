---
title: "Ad-hoc SQL (requires SQL config permission) Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Ad-hoc SQL (requires SQL config permission)

```js
// Multiple rows (default)
const rows = await ctx.sql.run('SELECT * FROM users LIMIT 10');

// Single row
const user = await ctx.sql.run(
  'SELECT * FROM users WHERE id = $id',
  { bind: { id: 1 }, type: 'selectRow' }
);

// Single value (e.g. COUNT, SUM)
const total = await ctx.sql.run(
  'SELECT COUNT(*) AS total FROM users',
  { type: 'selectVar' }
);
```
