---
title: "Namespace (ns) Example"
description: "Extracted example from ctx.t()"
---

# ctx.t()

## Namespace (ns)

```ts
ctx.t('Submit');  // same as ctx.t('Submit', { ns: 'runjs' })

ctx.t('Submit', { ns: 'myModule' });

ctx.t('Save', { ns: ['runjs', 'common'] });
```
