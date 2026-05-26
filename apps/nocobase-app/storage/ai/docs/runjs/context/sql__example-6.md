---
title: "Save template and reuse Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Save template and reuse

```js
// Save (requires SQL config permission)
await ctx.sql.save({
  uid: 'active-users-report',
  sql: 'SELECT * FROM users WHERE status = $status ORDER BY created_at DESC',
});

// Any logged-in user can run
const users = await ctx.sql.runById('active-users-report', {
  bind: { status: 'active' },
  type: 'selectRows',
});

// Delete template (requires SQL config permission)
await ctx.sql.destroy('active-users-report');
```
